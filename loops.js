/*
 * Copyright (c) 2018. Viacheslav V Bogdanov
 * viacheslav.v.bogdanov@gmail.com
 */

"use strict"

const ccxt  = require('ccxt')
const _     = require('underscore')
const log   = require ('ololog').configure ({ locate: false })
require ('ansicolor').nice
const _tab="\t"
const ants = require ('./cryptoants.js')

const delay = ms => new Promise(res => setTimeout(res, ms))

const mongoClient = require("mongodb").MongoClient
const url = "mongodb://localhost:27017/stalker"



let d = {} // Main data variable
d.exchangeNames = ccxt.exchanges
// _.each( d.exchangeNames, (exchane,name)=>{
//     log(d.name)
// })



let rmExchange = function( name ) {
    const i = d.exchangeNames.indexOf(name)
    if (i!==-1)
        d.exchangeNames.splice(i, 1)
}
// remove auth-needed exchanges
// TODO register for API keys
rmExchange('_1broker')   // require api key
rmExchange('bibox')      // require api key
rmExchange('xbtce')      // require api key

// TODO Check from other location
rmExchange('yunbi')      // 503 Service Temporarily Unavailable offline, on maintenance or unreachable from this location at the moment
rmExchange('braziliex')  // Not Accessed from my location yet
rmExchange('btctradeim') // not accessible from this location at the moment
rmExchange('bxinth')     // Cloudflare not accessible from this location at the moment
rmExchange('ccex')       // Cloudflare not accessible from this location at the moment
rmExchange('btcbox')     // 500 Internal Server Error
rmExchange('btcexchange')// failed, reason: getaddrinfo ENOTFOUND
rmExchange('jubi')       // [ExchangeError] jubi (check after lib update)
rmExchange('coinegg')    // [ExchangeNotAvailable]

// TODO Check TIMEOUTS
// rmExchange('bitstamp')   // request timed out (10000 ms)
// rmExchange('exmo')       // request timed out (10000 ms)
// rmExchange('jubi')       // request timed out (10000 ms)
// rmExchange('exmo')       // request timed out (10000 ms)
//
// rmExchange('coolcoin')   // request timed out (10000 ms)
// rmExchange('huobicny')   // request timed out (10000 ms)
// rmExchange('cryptopia')  // request timed out (10000 ms)
// rmExchange('coinexchange')// request timed out (10000 ms)
// rmExchange('coinexchange')// request timed out (10000 ms)

// No trade sources
// rmExchange('coinmarketcap')

d.exchangeNames = ['binance','bittrex','bytetrade','ftx',
'idex','kraken', 'poloniex', 'upbit']

function propsCount( o ) {
    let count = 0
    for (let p in o) {
        if (o.hasOwnProperty(p)) {
            // log(p, o[p])
            ++count
        }
    }
    return count
}

function getAllTickers() {
    _.each( d.exchangeNames, async (name) => {
        try {
            log(name)
            let exchange = new ccxt[name] ()
            if (!d[name]) d[name] = {}
            const e = d[name]
            e.exchange = exchange
            let startTime = Date.now()
            let tickers = await exchange.fetchTickers() // Not all exchanges supports 'get all in once'
            let responseTime = Date.now()-startTime

            if (!e.loops) {
                e.markets = await exchange.loadMarkets()
                await delay(1000)
                const timeLoopsCalc = 'Loops calculation '+name+_tab
                console.time(timeLoopsCalc)
                e.graph = ants.createGraph(e.markets)
                e.loops = ants.findLoops(e.graph, 3) // TODO try 4
                console.timeEnd(timeLoopsCalc)
            }
            const markets = e.markets
            const loops = e.loops
            const allChains = ants.findChains(name, markets, loops, tickers)
            //Filter by profit and volume
            const unsortedChains =
                // ants.filterChains(allChains, 0.001, 5, null)
                ants.filterChains(allChains, 0.0001, 1, 'BTC')
            // const chains = _.sortBy(unsortedChains, 'profit' )
            const chains = _.sortBy(allChains, 'profit' )

            if (chains.length>0) {
                log(' ')
                log( (' '+name+' ').blue.bgLightGray, _tab,
                    (propsCount(markets)+' markets').lightGray, _tab,
                    (loops.length+' loops').lightGray, _tab,
                    ((responseTime/1000).toFixed(3)+'ms').lightGray )
                ants.printChains(_.last(chains,10))
            }
            // log(chains)
            const saveToDb = true
            if (saveToDb && chains.length>0)
                chainsCollection.insertMany(chains, function(err, result){
                    if(err){
                        return log('[DB]'.red, result, err)
                    } else {
                        // log('[DB] Saved filtered directions'.lightGray, result.result)
                    }
                })
            // log( ++exchangesReceivedCount, ".", name.green, propsCount(tickers) )

        } catch (e) {
            // log( e )
            if (e.message.indexOf('fetchTickers')===-1 ) {
                if (e.message.indexOf(' GET ') === -1)
                    log('[UNHANDLED]'.red, e.message, e)
                else
                    log( '[TIMEOUT]'.lightGray, name)
            }
        }
    })
}



function work() {
    log(' ')
    log(new Date().toLocaleTimeString().lightGray,
        'LOOPS: Looking for good deals... '.lightGray)
    getAllTickers()
}

// log('Calc:'.green, 24*60/10)
const sec = 1000;
// work()
// setInterval( work, 15*sec)

let chainsCollection
mongoClient.connect(url, function(err, database){
    if(err){
        return log('[DB]'.red, err)
    }
    const db = database.db('loops-SU')
    // tickersCollection       = db.collection("tickers")
    // directionsCollection    = db.collection("AllDirections")
    chainsCollection      = db.collection("deals")

    work()
    setInterval( work, 30*sec)

})

// db.close();




