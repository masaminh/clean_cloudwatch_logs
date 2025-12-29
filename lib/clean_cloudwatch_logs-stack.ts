import * as cdk from 'aws-cdk-lib'
import {
  aws_stepfunctions as sfn,
  aws_stepfunctions_tasks as tasks,
  aws_scheduler as scheduler,
  aws_scheduler_targets as targets,
  aws_lambda as lambda,
  aws_lambda_nodejs as lambdaNodejs,
  aws_iam as iam,
  aws_sqs as sqs,
} from 'aws-cdk-lib'
import * as construct from 'constructs'

const retryProps: sfn.RetryProps = {
  errors: ['CloudWatchLogs.CloudWatchLogsException', 'CloudWatchLogs.SdkClientException'],
  interval: cdk.Duration.seconds(1),
  maxAttempts: 5,
  backoffRate: 2,
}

interface StackProps extends cdk.StackProps {
  queueArn: string;
}

export class CleanCloudwatchLogsStack extends cdk.Stack {
  constructor (scope: construct.Construct, id: string, props: StackProps) {
    super(scope, id, props)

    const getLogGroupsLambda = new lambdaNodejs.NodejsFunction(this, 'get_log_groups', {
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.minutes(1),
      tracing: lambda.Tracing.ACTIVE,
      runtime: lambda.Runtime.NODEJS_22_X,
    })

    getLogGroupsLambda.addToRolePolicy(new iam.PolicyStatement({
      resources: ['arn:aws:logs:*:*:log-group:*:*'],
      actions: ['logs:DescribeLogGroups'],
    }))

    const getLogGroups = new tasks.LambdaInvoke(this, 'GetLogGroups', {
      lambdaFunction: getLogGroupsLambda,
      inputPath: '$.time',
      payloadResponseOnly: true,
    })

    const getLogStreamsLambda = new lambdaNodejs.NodejsFunction(this, 'get_log_streams', {
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.minutes(5),
      tracing: lambda.Tracing.ACTIVE,
      runtime: lambda.Runtime.NODEJS_22_X,
    })

    getLogStreamsLambda.addToRolePolicy(new iam.PolicyStatement({
      resources: ['arn:aws:logs:*:*:log-group:*:log-stream:*'],
      actions: ['logs:DescribeLogStreams'],
    }))

    const getLogStreams = new tasks.LambdaInvoke(this, 'GetLogStreams', {
      lambdaFunction: getLogStreamsLambda,
      payloadResponseOnly: true,
    })
    const deleteLogStreamsLambda = new lambdaNodejs.NodejsFunction(this, 'delete_log_streams', {
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.minutes(15),
      tracing: lambda.Tracing.ACTIVE,
      runtime: lambda.Runtime.NODEJS_22_X,
    })

    deleteLogStreamsLambda.addToRolePolicy(new iam.PolicyStatement({
      resources: ['arn:aws:logs:*:*:log-group:*:log-stream:*'],
      actions: ['logs:DeleteLogStream'],
    }))

    const deleteLogStreams = new tasks.LambdaInvoke(this, 'DeleteLogStreams', {
      lambdaFunction: deleteLogStreamsLambda,
      payloadResponseOnly: true,
    })

    const notifyMessage = new tasks.EvaluateExpression(this, 'NotifyMessage', {
      // eslint-disable-next-line no-template-curly-in-string
      expression: '`Region: ${$.region}, Loggroup: ${$.logGroupName} is empty.`',
      resultPath: '$.notifyMessage',
    })

    const notifyEmptyLogGroup = new tasks.SqsSendMessage(this, 'NotifyEmptyLogGroup', {
      queue: sqs.Queue.fromQueueArn(this, 'NotifyQueue', props.queueArn),
      messageBody: sfn.TaskInput.fromObject({
        webhookname: 'Develop',
        message: sfn.JsonPath.stringAt('$.notifyMessage'),
      }),
    })

    const getLogStreamsMap = new sfn.Map(this, 'GetLogStreamsMap', {
      itemsPath: sfn.JsonPath.stringAt('$.targetLogGroups'),
      itemSelector: {
        'eventTime.$': '$.eventTime',
        'logGroupInfo.$': '$$.Map.Item.Value',
      },
      maxConcurrency: 1,
      resultPath: sfn.JsonPath.DISCARD,
    })

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
    }).addRetry(retryProps)

    const setRetentionMap = new sfn.Map(this, 'SetRetentionMap', {
      itemsPath: sfn.JsonPath.stringAt('$.noRetentionLogGroups'),
      itemSelector: {
        'logGroupInfo.$': '$$.Map.Item.Value',
      },
      maxConcurrency: 1,
      resultPath: sfn.JsonPath.DISCARD,
    })

    const parallelLogGroups = new sfn.Parallel(this, 'ParallelLogGroups')

    parallelLogGroups.branch(
      getLogStreamsMap.itemProcessor(getLogStreams.next(
        new sfn.Choice(this, 'IsEmptyLogGroup')
          .when(
            sfn.Condition.booleanEquals('$.isEmpty', true),
            notifyMessage.next(notifyEmptyLogGroup)
          )
          .otherwise(deleteLogStreams)
      )),
      setRetentionMap.itemProcessor(setRetention)
    )

    const stateMachine = new sfn.StateMachine(this, 'StateMachine', {
      definitionBody: sfn.DefinitionBody.fromChainable(getLogGroups.next(parallelLogGroups)),
    })

    // eslint-disable-next-line no-new
    new scheduler.Schedule(this, 'Schedule', {
      schedule: scheduler.ScheduleExpression.rate(cdk.Duration.days(1)),
      target: new targets.StepFunctionsStartExecution(stateMachine, {}),
      timeWindow: scheduler.TimeWindow.flexible(cdk.Duration.hours(1)),
    })
  }
}
