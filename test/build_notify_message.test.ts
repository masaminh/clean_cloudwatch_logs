import {
  buildCloudWatchLogsUrl,
  buildNotifyMessageLine,
  handler,
} from '../lib/clean_cloudwatch_logs-stack.build_notify_message'

describe('buildNotifyMessageLine', () => {
  test('空LogGroup1件分のメッセージ行を生成する', () => {
    expect(buildNotifyMessageLine('ap-northeast-1', '/foo')).toBe(
      'Region: ap-northeast-1, Loggroup: /foo is empty.'
    )
  })
})

describe('buildCloudWatchLogsUrl', () => {
  test('ap-northeast-1 の CloudWatch Logs コンソール URL を生成する', () => {
    expect(buildCloudWatchLogsUrl('ap-northeast-1')).toBe(
      'https://ap-northeast-1.console.aws.amazon.com/cloudwatch/home?region=ap-northeast-1#logsV2:log-groups'
    )
  })

  test('us-east-1 の CloudWatch Logs コンソール URL を生成する', () => {
    expect(buildCloudWatchLogsUrl('us-east-1')).toBe(
      'https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups'
    )
  })
})

describe('handler', () => {
  test('空LogGroupが0件の場合は空文字を返す', async () => {
    const result = await handler({
      getLogStreamsResults: [
        { logGroupName: '/foo', isEmpty: false, region: 'ap-northeast-1' },
      ],
    })

    expect(result).toEqual({ notifyMessage: '' })
  })

  test('空LogGroupが1件の場合は1行メッセージとCloudWatch Logsリンクを返す', async () => {
    const result = await handler({
      getLogStreamsResults: [
        { logGroupName: '/foo', isEmpty: true, region: 'ap-northeast-1' },
      ],
    })

    expect(result).toEqual({
      notifyMessage: [
        'Region: ap-northeast-1, Loggroup: /foo is empty.',
        buildCloudWatchLogsUrl('ap-northeast-1'),
      ].join('\n'),
    })
  })

  test('空LogGroupが複数件の場合は改行連結メッセージとCloudWatch Logsリンクを返す', async () => {
    const result = await handler({
      getLogStreamsResults: [
        { logGroupName: '/foo', isEmpty: true, region: 'ap-northeast-1' },
        { logGroupName: '/bar', isEmpty: false, region: 'ap-northeast-1' },
        { logGroupName: '/baz', isEmpty: true, region: 'ap-northeast-1' },
      ],
    })

    expect(result).toEqual({
      notifyMessage: [
        'Region: ap-northeast-1, Loggroup: /foo is empty.',
        'Region: ap-northeast-1, Loggroup: /baz is empty.',
        buildCloudWatchLogsUrl('ap-northeast-1'),
      ].join('\n'),
    })
  })

  test('getLogStreamsResultsが空配列の場合は空文字を返す', async () => {
    const result = await handler({ getLogStreamsResults: [] })

    expect(result).toEqual({ notifyMessage: '' })
  })

  test('入力が不正な場合は空文字を返す', async () => {
    await expect(handler(null)).resolves.toEqual({ notifyMessage: '' })
    await expect(handler({})).resolves.toEqual({ notifyMessage: '' })
    await expect(handler({ getLogStreamsResults: 'invalid' })).resolves.toEqual({ notifyMessage: '' })
    await expect(handler({
      getLogStreamsResults: [{ logGroupName: '/foo', isEmpty: 'true', region: 'ap-northeast-1' }],
    })).resolves.toEqual({ notifyMessage: '' })
    await expect(handler({
      getLogStreamsResults: [{ logGroupName: 123, isEmpty: true, region: 'ap-northeast-1' }],
    })).resolves.toEqual({ notifyMessage: '' })
    await expect(handler({
      getLogStreamsResults: [{ logGroupName: '/foo', isEmpty: true, region: 123 }],
    })).resolves.toEqual({ notifyMessage: '' })
  })
})
