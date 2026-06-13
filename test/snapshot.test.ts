import * as cdk from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { CleanCloudwatchLogsStack, lambdaFunctionNames } from '../lib/clean_cloudwatch_logs-stack'

export const ignoreAssetHashSerializer = {
  test: (val: unknown) => typeof val === 'string',
  serialize: (val: string) => {
    return `"${val.replace(/([A-Fa-f0-9]{64}.zip)/, 'HASH-REPLACED.zip')}"`
  },
}

test('snapshot test', () => {
  const app = new cdk.App()
  const queueArn = 'arn:aws:sqs:ap-northeast-1:123456789012:Queue'
  console.log(queueArn)

  const stack = new CleanCloudwatchLogsStack(app, 'MyTestStack', {
    env: { region: 'ap-northeast-1' }, queueArn,
  })
  // スタックからテンプレート(JSON)を生成
  const template = Template.fromStack(stack)

  const expectedTags = [
    { Key: 'Project', Value: 'clean_cloudwatch_logs' },
    { Key: 'Env', Value: 'prod' },
    { Key: 'ManagedBy', Value: 'cdk' },
  ]
  for (const tag of expectedTags) {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Tags: Match.arrayWith([tag]),
    })
  }

  template.resourceCountIs('AWS::Logs::LogGroup', 4)
  for (const functionName of Object.values(lambdaFunctionNames)) {
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: `/aws/lambda/${functionName}`,
      RetentionInDays: 30,
    })
  }
  template.allResources('AWS::Logs::LogGroup', {
    DeletionPolicy: 'Delete',
    UpdateReplacePolicy: 'Delete',
  })

  expect.addSnapshotSerializer(ignoreAssetHashSerializer)

  // 生成したテンプレートとスナップショットが同じか検証
  expect(template.toJSON()).toMatchSnapshot()
})
