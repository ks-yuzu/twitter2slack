import TwitterV2 from 'twitter-v2'
import {IncomingWebhook as SlackIncomingWebhook} from '@slack/webhook'
import retry from 'async-retry'
import dayjs from 'dayjs'
import dayjsPluginUtc from 'dayjs/plugin/utc'
dayjs.extend(dayjsPluginUtc)


// CONF
const SLACK_WEBHOOK     = getEnvOrDie('SLACK_WEBHOOK')
const TWITTER_CREDENTIAL = {
  consumer_key:        getEnvOrDie('TWITTER_CONSUMER_KEY'),
  consumer_secret:     getEnvOrDie('TWITTER_CONSUMER_SECRET'),
  access_token_key:    getEnvOrDie('TWITTER_ACCESS_TOKEN_KEY'),
  access_token_secret: getEnvOrDie('TWITTER_ACCESS_TOKEN_SECRET'),
}


const slack = new SlackIncomingWebhook(SLACK_WEBHOOK)


function die(msg: string): never {
  throw new Error(msg)
}

function getEnv(envName: string) {
  return process.env[envName]
}

function getEnvOrDie(envName: string) {
  const env = getEnv(envName)

  if ( env == null ) { die(`set env ${envName}`) }
  return env
}

async function postSlack({channel, username, text, iconUrl}:
                         {channel: string, username: string, text: string, iconUrl: string}) {
  const onRetry = (err: Error, i: number) => {
    if (!err) { return }
    console.log(`error: ${err}`)
    console.log(`[${i}] retry...`)
  }

  await retry(
    async () => await slack.send({
      channel,
      username,
      text,
      icon_url: iconUrl,
    }), { onRetry }
  )
}

;(async () => {
  // ARGS
  const args = process.argv.slice(2)
  const twitterId      = args.shift() || getEnvOrDie('TWITTER_USER')
  const slackChannel   = args.shift() || getEnv('SLACK_CHANNEL')   || '#bot-twitter'
  console.log({twitterId, slackChannel})

  const twitter = new TwitterV2(TWITTER_CREDENTIAL)

  // get time rangs
  const now = dayjs().utc()
  const start = now.add(-2, 'minutes').format('YYYY-MM-DDTHH:mm:30[Z]')
  const end   = now.add(-1, 'minutes').format('YYYY-MM-DDTHH:mm:30[Z]')
  console.log({start, end})

  const twitterUser = await twitter.get('users/by', {usernames: twitterId}) as any
  const twitterUserid = twitterUser?.data?.[0]?.id as string
  console.log({twitterUserid})

  const tweets = await twitter.get(`users/${twitterUserid}/tweets`, {
    'tweet.fields': 'created_at,attachments',
    'user.fields':  'id,name,profile_image_url,username',
    'media.fields': 'type,url',
    'expansions':   'author_id,attachments.media_keys',
    'start_time':   start,
    'end_time':     end,
  }) as {[key: string]: any}
  console.log(JSON.stringify(tweets, null, 2))

  if ( tweets?.meta?.result_count === 0 ) {
    console.log('no tweets')
    return
  }

  for (const tweet of tweets.data.reverse()) {
    const {id, text, attachments, created_at: timestamp} = tweet
    console.log({id, text, attachments, timestamp})

    const username = tweets.includes.users?.find((i: any) => i.id === tweet.author_id)?.name
    const iconUrl  = tweets.includes.users?.find((i: any) => i.id === tweet.author_id)?.profile_image_url
    console.log({username, iconUrl})

    const attachmentUrls = (attachments?.media_keys || [])
      .map((mediaKey: string) => tweets.includes.media?.find((i: any) => i.media_key === mediaKey)?.url)
      .filter((i: string | undefined) => i != null)
    console.log({attachmentUrls})

    await postSlack({
      channel: slackChannel,
      username,
      iconUrl,
      text: `https://twitter.com/${twitterId}/status/${id}\n` + text,
    })

    await new Promise(r => setTimeout(r, 2000)) // sleep
  }
})()
