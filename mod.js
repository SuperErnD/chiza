// deno-lint-ignore-file require-await
import { StandardWebSocketClient } from 'ws';
import * as APIv10 from "dap";
import { Logger } from "https://deno.land/x/optic@1.3.5/mod.ts"
import { EventEmitter } from 'events'
import Random from './Random.js'
import config from './config.json' assert { type: "json" }

let data = JSON.parse(await Deno.readTextFile('./messages.json'))
async function setAndReloadDatabase(guild, channel, message) {
    if(!data.guilds[guild]) {
        data.guilds[guild] = {}
    }
    if(!data.guilds[guild][channel]) {
        data.guilds[guild][channel] = []
    }
    data.guilds[guild][channel].push(message)
    await Deno.writeTextFile('./messages.json', JSON.stringify(data))
    data = JSON.parse(await Deno.readTextFile('./messages.json'))
}


const random = new Random()

const logger = new Logger('Bot')
const baseUrl = `https://discord.com/api/v${APIv10.APIVersion}`
const token = config.token
const Routes = APIv10.Routes
function getMessages(guild_id, channel_id) {
    if(!data.guilds[guild_id]) data.guilds[guild_id] = {}
    return data.guilds[guild_id][channel_id]
}
async function request(path, method, body, auth) {
    
    const req = new Request(
        `${baseUrl}${path}`,
        {
            method: method,
            body: JSON.stringify(body),
            headers: {
                Authorization: `Bot ${auth ? token : undefined}`,
                "Content-Type": "application/json"
            }
        }
    )
    return await (await fetch(req)).json()
}
Array.prototype.random = function () {
    let word = this[Math.floor((Math.random()*this.length))]
    const как_улучшить = random.int(0,4)
    console.log(как_улучшить, word)
    if(как_улучшить===2) word=word.toLowerCase()
    if(как_улучшить===3) word=word.toUpperCase()
    return word;
}
const client = new EventEmitter()
const wsUrl = (await request(Routes.gateway())).url
client.ratelimited=false
function connectToWs() {
    const ws = new StandardWebSocketClient(`${wsUrl}?v=${APIv10.GatewayVersion}&encoding=json`)
    ws.guilds = []
    ws.on('open', () => {
        console.log('Connected')
        const intents = [
            APIv10.GatewayIntentBits.GuildMessages,
            APIv10.GatewayIntentBits.Guilds,
            APIv10.GatewayIntentBits.MessageContent
        ]
        const initialIntents = 0;
        const intentsResult = intents.reduce(
            (previousValue, currentValue) => previousValue + currentValue,
            initialIntents
        );
          
        console.log(intentsResult);

        if(!client.session_id) return ws.send(JSON.stringify({
            op: 2,
            d: {
                token: token,
                properties: {
                    os: Deno.build.os,
                    browser: "Deno",
                    device: "Deno"
                },
                compress: false,
                large_threshold: 250,
                presence: {
                    activities: [{
                        name: "/help | Reading messages..",
                        type: 0
                    }],
                    status: 'online',
                    since: 91879201,
                    afk: false
                },
                intents: intentsResult
            }
        }))
        ws.send(JSON.stringify({
            op: 6,
            d: {
                token: token,
                session_id: client.session_id,
                seq: client.seq
            }
        }))
    })
    ws.on('message', async (data) => {
        data = JSON.parse(data.data)
        if(!client.seq) client.seq=0
        client.seq+=1
        switch (data.op) {
            case APIv10.GatewayOpcodes.Hello:
                logger.info(`[HELLO] Received`)
                ws.pinger = setInterval(() => {
                    ws.send(JSON.stringify({
                        op: 1,
                        d: ws.seq ? ws.seq : null
                    }))
                }, data.d.heartbeat_interval)
                break
            case APIv10.GatewayOpcodes.HeartbeatAck: 
                logger.info('ACK')
                break
            case APIv10.GatewayOpcodes.InvalidSession:
                client.session_id=null
                ws.close()
                break
            case APIv10.GatewayOpcodes.Reconnect:
                ws.close()
                break
            case APIv10.GatewayOpcodes.Dispatch:
                switch (data.t) {
                    case APIv10.GatewayDispatchEvents.Ready:
                        logger.info('Ready')
                        client.ws=ws
                        client.session_id=data.d.session_id
                        client.user=data.d.user
                        break
                    case APIv10.GatewayDispatchEvents.GuildCreate:
                        ws.guilds.push(data.d)
                        break
                    case APIv10.GatewayDispatchEvents.MessageCreate:
                        client.emit('messageCreate', data.d)
                        break
                    case APIv10.GatewayDispatchEvents.Resumed:
                        logger.info('Resumed')
                        break
                    default:
                        logger.warn('Unknown event')
                        logger.warn(JSON.stringify(data, null, 2))
                        break
                }
                break
            default: 
                logger.warn(`[${data.t}] Unknown`)
                logger.warn(data)
                break
        }
    
    })
    ws.on('close', (data) => {

        logger.warn('Disconnected: '+data)
        clearInterval(ws.pinger)
        connectToWs()
    })
    ws.on('error', () => {
        console.log('err')
    })
}

client.on('messageCreate', async (message) => {
    if(message.tts) return
    const что_делать = random.int(0, 4)
    
    if(что_делать===2) {
        setAndReloadDatabase(message.guild_id, message.channel_id, message.content)
    } else if(что_делать===3) {
        if(client.ratelimited) return

        const req = await request(Routes.channelMessages(message.channel_id), 'POST', {content: getMessages(message.guild_id, message.channel_id).random()}, true)
        if(req.retry_after) {
            logger.warn('Rate limited')
            client.ratelimited = true
            setTimeout(() => {client.ratelimited=false}, req.retry_after)
        }
    }
})
connectToWs()