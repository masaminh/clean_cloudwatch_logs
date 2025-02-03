import * as cdk from 'aws-cdk-lib';
import * as fs from 'node:fs';
import { Template } from 'aws-cdk-lib/assertions';
import { CleanCloudwatchLogsStack } from '../lib/clean_cloudwatch_logs-stack';

test('snapshot test', () => {
  const context = JSON.parse(fs.readFileSync('cdk.context.json', {encoding: 'utf8'}));
  const app = new cdk.App({context});
  const queueArn = app.node.tryGetContext('queue_arn');
  console.log(queueArn);

  const stack = new CleanCloudwatchLogsStack(app, 'MyTestStack',  {
    env: { region: 'ap-northeast-1' }, queueArn,
  });
  // スタックからテンプレート(JSON)を生成
  const template = Template.fromStack(stack).toJSON();

  // 生成したテンプレートとスナップショットが同じか検証
  expect(template).toMatchSnapshot();
});
