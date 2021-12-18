import * as cdk from '@aws-cdk/core';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks';
import * as events from '@aws-cdk/aws-events';
import * as targets from '@aws-cdk/aws-events-targets';

const retryProps: sfn.RetryProps = {
  errors: ['CloudWatchLogs.CloudWatchLogsException', 'CloudWatchLogs.SdkClientException'],
  interval: cdk.Duration.seconds(1),
  maxAttempts: 5,
  backoffRate: 2,
};

// eslint-disable-next-line import/prefer-default-export
export class CleanCloudwatchLogsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const getEventTime = new tasks.EvaluateExpression(this, 'GetEventTime', {
      expression: 'Date.parse($.time)',
      resultPath: '$.eventTime',
    });

    const getTargetTime = new tasks.EvaluateExpression(this, 'GetTargetTime', {
      expression: '$.eventTime - 7 * 24 * 60 * 60 * 1000',
      resultPath: '$.targetTime',
    });

    // 本来であれば１回でLogGroupを取り切れる保証はないが、
    // 現在の運用では1回で取り切れるため、DescribeLogGroupsの繰り返しは行わない
    const describeLogGroups = new tasks.CallAwsService(this, 'DescribeLogGroups', {
      service: 'cloudwatchlogs',
      action: 'describeLogGroups',
      iamAction: 'logs:describeLogGroups',
      iamResources: ['*'],
      resultPath: '$.describeLogGroupOutput',
    }).addRetry(retryProps);

    const logGroupMap = new sfn.Map(this, 'LogGroupMap', {
      itemsPath: sfn.JsonPath.stringAt('$.describeLogGroupOutput.LogGroups'),
      parameters: {
        'logGroup.$': '$$.Map.Item.Value',
        'targetTime.$': '$.targetTime',
        'eventTime.$': '$.eventTime',
      },
      maxConcurrency: 1,
    }).iterator(this.createLogGroupFlow());

    const stateMachine = new sfn.StateMachine(this, 'StateMachine', {
      definition: getEventTime
        .next(getTargetTime)
        .next(describeLogGroups)
        .next(logGroupMap),
    });

    // eslint-disable-next-line no-new
    new events.Rule(this, 'Rule', {
      schedule: events.Schedule.rate(cdk.Duration.days(1)),
      targets: [new targets.SfnStateMachine(stateMachine)],
      enabled: true,
    });
  }

  private createLogGroupFlow(): sfn.IChainable {
    // LogGroup単位で動作するフロー。
    // ・LogGroupが作られてから7日たっていない場合は無操作
    // ・LogGroupに保持期間設定がなされていない場合は30日に設定
    // ・LogGroupにLogStreamがない場合、LogGroupを削除
    // ・上記以外の場合、LogStreamの整理を行う

    const setRetentionInDays = new tasks.CallAwsService(this, 'SetRetentionInDays', {
      service: 'cloudwatchlogs',
      action: 'putRetentionPolicy',
      iamAction: 'logs:putRetentionPolicy',
      iamResources: ['*'],
      resultPath: sfn.JsonPath.DISCARD,
      parameters: {
        'LogGroupName.$': '$.logGroup.LogGroupName',
        RetentionInDays: 30,
      },
    }).addRetry(retryProps);

    const describeLogStreams = new tasks.CallAwsService(this, 'describeLogStreams', {
      service: 'cloudwatchlogs',
      action: 'describeLogStreams',
      iamAction: 'logs:describeLogStreams',
      iamResources: ['*'],
      resultPath: '$.describeLogStreamsOutput',
      parameters: {
        'LogGroupName.$': '$.logGroup.LogGroupName',
      },
    }).addRetry(retryProps);

    const describeLogStreamsMore = new tasks.CallAwsService(this, 'describeLogStreamsMore', {
      service: 'cloudwatchlogs',
      action: 'describeLogStreams',
      iamAction: 'logs:describeLogStreams',
      iamResources: ['*'],
      resultPath: '$.describeLogStreamsOutput',
      parameters: {
        'LogGroupName.$': '$.logGroup.LogGroupName',
        'NextToken.$': '$.describeLogStreamsOutput.NextToken',
      },
    }).addRetry(retryProps);

    // LogStream複数で動くStateMachine (DescribeLogStreamsの戻り単位)
    const stateMachineLogStreamFlow = new sfn.StateMachine(this, 'StateMachineLogStream', {
      definition: this.createLogStreamFlowMap(),
    });

    const logStreamsMap = new tasks.StepFunctionsStartExecution(this, 'LogStreamFlowMap', {
      stateMachine: stateMachineLogStreamFlow,
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      resultPath: sfn.JsonPath.DISCARD,
    });

    // LogStreamごとの処理結果は上位では使わないので、状態は空objectにしておく
    const logStreamMapLast = new sfn.Pass(this, 'LogStreamsMapLast', {
      result: sfn.Result.fromObject({}),
    });

    const logStreamsMapLoop = describeLogStreams
      .next(logStreamsMap)
      .next(
        new sfn.Choice(this, 'MoreLogStreams')
          .when(
            sfn.Condition.isPresent('$.describeLogStreamsOutput.NextToken'),
            describeLogStreamsMore.next(logStreamsMap),
          )
          .otherwise(logStreamMapLast),
      );

    const deleteLogGroup = new tasks.CallAwsService(this, 'deleteLogGroup', {
      service: 'cloudwatchlogs',
      action: 'deleteLogGroup',
      iamAction: 'logs:deleteLogGroup',
      iamResources: ['*'],
      resultPath: '$.deleteLogGroupOutput',
      parameters: {
        'LogGroupName.$': '$.logGroup.LogGroupName',
      },
    }).addRetry(retryProps);

    return new sfn.Choice(this, 'JudgeLogGroup')
      .when(
        sfn.Condition.numberGreaterThanJsonPath('$.logGroup.CreationTime', '$.targetTime'),
        logStreamMapLast,
      )
      .when(
        sfn.Condition.isNotPresent('$.logGroup.RetentionInDays'),
        setRetentionInDays.next(logStreamMapLast),
      )
      .when(
        sfn.Condition.numberEquals('$.logGroup.StoredBytes', 0),
        deleteLogGroup.next(logStreamMapLast),
      )
      .otherwise(logStreamsMapLoop);
  }

  private createLogStreamFlowMap(): sfn.IChainable {
    return new sfn.Map(this, 'LogStreamsMap', {
      itemsPath: sfn.JsonPath.stringAt('$.describeLogStreamsOutput.LogStreams'),
      parameters: {
        'logStream.$': '$$.Map.Item.Value',
        'logGroupName.$': '$.logGroup.LogGroupName',
        'eventTime.$': '$.eventTime',
        'retentionInDays.$': '$.logGroup.RetentionInDays',
      },
      resultPath: '$.logStreamsMapOutput',
      maxConcurrency: 1,
    }).iterator(this.createLogStreamFlow());
  }

  private createLogStreamFlow(): sfn.IChainable {
    // 最後のログ登録から保持期間+1日以上経過しているLogStreamは削除する

    const getStreamTargetTime = new tasks.EvaluateExpression(this, 'GetStreamTargetTime', {
      expression: '$.eventTime - ($.retentionInDays + 1) * 24 * 60 * 60 * 1000',
      resultPath: '$.streamTargetTime',
    });

    const deleteLogStream = new tasks.CallAwsService(this, 'deleteLogStream', {
      service: 'cloudwatchlogs',
      action: 'deleteLogStream',
      iamAction: 'logs:deleteLogStream',
      iamResources: ['*'],
      resultPath: '$.deleteLogStreamOutput',
      parameters: {
        'LogGroupName.$': '$.logGroupName',
        'LogStreamName.$': '$.logStream.LogStreamName',
      },
    }).addRetry(retryProps);

    const logStreamFlowLast = new sfn.Pass(this, 'LogStreamFlowLast', {
      result: sfn.Result.fromObject({}),
    });

    return getStreamTargetTime
      .next(
        new sfn.Choice(this, 'JudgeNeedDeleteLogStream')
          .when(
            sfn.Condition.or(
              sfn.Condition.and(
                sfn.Condition.isNotPresent('$.logStream.LastIngestionTime'),
                sfn.Condition.numberLessThanJsonPath('$.logStream.CreationTime', '$.streamTargetTime'),
              ),
              sfn.Condition.numberLessThanJsonPath('$.logStream.LastIngestionTime', '$.streamTargetTime'),
            ),
            deleteLogStream.next(logStreamFlowLast),
          )
          .otherwise(logStreamFlowLast),
      );
  }
}
