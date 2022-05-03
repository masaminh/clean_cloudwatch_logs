import * as cdk from 'aws-cdk-lib';
import {
  aws_stepfunctions as sfn,
  aws_stepfunctions_tasks as tasks,
  aws_events as events,
  aws_events_targets as targets,
  aws_lambda as lambda,
  aws_lambda_nodejs as lambdaNodejs,
  aws_iam as iam,
} from 'aws-cdk-lib';
import * as construct from 'constructs';

const retryProps: sfn.RetryProps = {
  errors: ['CloudWatchLogs.CloudWatchLogsException', 'CloudWatchLogs.SdkClientException'],
  interval: cdk.Duration.seconds(1),
  maxAttempts: 5,
  backoffRate: 2,
};

// eslint-disable-next-line import/prefer-default-export
export class CleanCloudwatchLogsStack extends cdk.Stack {
  constructor(scope: construct.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const getLogGroupsLambda = new lambdaNodejs.NodejsFunction(this, 'get_log_groups', {
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.minutes(1),
      tracing: lambda.Tracing.ACTIVE,
    });

    getLogGroupsLambda.addToRolePolicy(new iam.PolicyStatement({
      resources: ['arn:aws:logs:*:*:log-group:*:*'],
      actions: ['logs:DescribeLogGroups'],
    }));

    const getLogGroups = new tasks.LambdaInvoke(this, 'GetLogGroups', {
      lambdaFunction: getLogGroupsLambda,
      inputPath: '$.time',
      payloadResponseOnly: true,
    });

    const getLogStreamsLambda = new lambdaNodejs.NodejsFunction(this, 'get_log_streams', {
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.minutes(5),
      tracing: lambda.Tracing.ACTIVE,
    });

    getLogStreamsLambda.addToRolePolicy(new iam.PolicyStatement({
      resources: ['arn:aws:logs:*:*:log-group:*:log-stream:*'],
      actions: ['logs:DescribeLogStreams'],
    }));

    const getLogStreams = new tasks.LambdaInvoke(this, 'GetLogStreams', {
      lambdaFunction: getLogStreamsLambda,
      payloadResponseOnly: true,
    });
    const deleteLogStreamsLambda = new lambdaNodejs.NodejsFunction(this, 'delete_log_streams', {
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.minutes(15),
      tracing: lambda.Tracing.ACTIVE,
    });

    deleteLogStreamsLambda.addToRolePolicy(new iam.PolicyStatement({
      resources: ['arn:aws:logs:*:*:log-group:*:log-stream:*'],
      actions: ['logs:DeleteLogStream'],
    }));

    const deleteLogStreams = new tasks.LambdaInvoke(this, 'DeleteLogStreams', {
      lambdaFunction: deleteLogStreamsLambda,
      payloadResponseOnly: true,
    });

    const getLogStreamsMap = new sfn.Map(this, 'GetLogStreamsMap', {
      itemsPath: sfn.JsonPath.stringAt('$.targetLogGroups'),
      parameters: {
        'eventTime.$': '$.eventTime',
        'logGroupInfo.$': '$$.Map.Item.Value',
      },
      maxConcurrency: 1,
      resultPath: sfn.JsonPath.DISCARD,
    });

    const setRetention = new tasks.CallAwsService(this, 'SetRetentionInDays', {
      service: 'cloudwatchlogs',
      action: 'putRetentionPolicy',
      iamAction: 'logs:putRetentionPolicy',
      iamResources: ['arn:aws:logs:*:*:log-group:*:*'],
      resultPath: sfn.JsonPath.DISCARD,
      parameters: {
        'LogGroupName.$': '$.logGroupInfo.name',
        RetentionInDays: 30,
      },
    }).addRetry(retryProps);

    const setRetentionMap = new sfn.Map(this, 'SetRetentionMap', {
      itemsPath: sfn.JsonPath.stringAt('$.noRetentionLogGroups'),
      parameters: {
        'logGroupInfo.$': '$$.Map.Item.Value',
      },
      maxConcurrency: 1,
      resultPath: sfn.JsonPath.DISCARD,
    });

    const parallelLogGroups = new sfn.Parallel(this, 'ParallelLogGroups');

    parallelLogGroups.branch(
      getLogStreamsMap.iterator(getLogStreams.next(deleteLogStreams)),
      setRetentionMap.iterator(setRetention),
    );

    const stateMachine = new sfn.StateMachine(this, 'StateMachine', {
      definition: getLogGroups.next(parallelLogGroups),
    });

    // eslint-disable-next-line no-new
    new events.Rule(this, 'Rule', {
      schedule: events.Schedule.rate(cdk.Duration.days(1)),
      targets: [new targets.SfnStateMachine(stateMachine)],
      enabled: true,
    });
  }
}
