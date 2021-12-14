#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { CleanCloudwatchLogsStack } from '../lib/clean_cloudwatch_logs-stack';

const app = new cdk.App();
/* eslint-disable no-new */
new CleanCloudwatchLogsStack(app, 'CleanCloudwatchLogsStack-ap-northeast-1', { env: { region: 'ap-northeast-1' } });
new CleanCloudwatchLogsStack(app, 'CleanCloudwatchLogsStack-us-east-1', { env: { region: 'us-east-1' } });
/* eslint-enable no-new */
