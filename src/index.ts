import TwitterV2 from 'twitter-v2'
import DiscordNotification from 'discord-notification'
import dayjs from 'dayjs'
import dayjsPluginUtc from 'dayjs/plugin/utc'
dayjs.extend(dayjsPluginUtc)


// CONF
const DISCORD_BOT_TOKEN = getEnvOrDie('DISCORD_BOT_TOKEN')
// const DISCORD_SERVER_ID = getEnvOrDie('DISCORD_SERVER_ID')
const TWITTER_CREDENTIAL = {
  consumer_key:        getEnvOrDie('TWITTER_CONSUMER_KEY'),
  consumer_secret:     getEnvOrDie('TWITTER_CONSUMER_SECRET'),
  access_token_key:    getEnvOrDie('TWITTER_ACCESS_TOKEN_KEY'),
  access_token_secret: getEnvOrDie('TWITTER_ACCESS_TOKEN_SECRET'),
}


const discord = new DiscordNotification({
  botToken: DISCORD_BOT_TOKEN,
  // serverId: DISCORD_SERVER_ID,
  verbose: true,
})


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

;(async () => {
  // ARGS
  const args = process.argv.slice(2)
  const twitterId      = args.shift() || getEnvOrDie('TWITTER_USER')
  const discordChannel = args.shift() || getEnv('DISCORD_CHANNEL') || 'bot-twitter'
  console.log({twitterId, discordChannel})

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

  await discord.init()

  for (const tweet of tweets.data.reverse()) {
    const {id, text, attachments, created_at: timestamp} = tweet
    console.log({id, text, attachments, timestamp})

    const username = tweets.includes.users?.find((i: any) => i.id === tweet.author_id)?.name
    const iconUrl  = tweets.includes.users?.find((i: any) => i.id === tweet.author_id)?.profile_image_url
    console.log({username, iconUrl})

    // if (attachments?.media_keys) {
    //   for (const mediaKey of attachments?.media_keys) {
    //     const media = tweets.includes.media?.find((i: any) => i.media_key === mediaKey)
    //     if (media == null) { continue }

    //     const {type, url} = media
    //     switch (type) {
    //       case 'photo': {
    //         const data = await axios.get(url, {responseType: 'arraybuffer'})
    //         break
    //       }
    //     }
    //   }
    // }
    const attachmentUrls = (attachments?.media_keys || [])
      .map((mediaKey: string) => tweets.includes.media?.find((i: any) => i.media_key === mediaKey)?.url)
      .filter((i: string | undefined) => i != null)
    console.log({attachmentUrls})

    await discord.post({
      channel: discordChannel.replace(/^#/, ''),
      username,
      iconUrl,
      text: `https://twitter.com/${twitterId}/status/${id}\n` + text,
      files: attachmentUrls,
    })

    await new Promise(r => setTimeout(r, 2000)) // sleep
  }

  await discord.destroy()
})()
