import * as cdk from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { CleanCloudwatchLogsStack } from '../lib/clean_cloudwatch_logs-stack'

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

  expect.addSnapshotSerializer(ignoreAssetHashSerializer)

  // 生成したテンプレートとスナップショットが同じか検証
  expect(template.toJSON()).toMatchSnapshot()
})
