/*
 * Copyright (c) 2018. Viacheslav V Bogdanov
 * viacheslav.v.bogdanov@gmail.com
 */

"use strict"
const assert = require('assert')
const ccxt  = require('ccxt')
const _     = require('underscore')
const log   = require ('ololog').configure ({ locate: false })
require ('ansicolor').nice
const _tab="\t"
const keys = require ('./keys.js')


const mongoClient = require("mongodb").MongoClient
const url = "mongodb://localhost:27017/stalker"
var mongodb
function dbInsertMany(arr) {
    const insertMany = function(arr){
        filteredCollection.insertMany(arr, function(err, result){
            if(err){
                return log('[DB]'.red, result, err)
            } else {
                log(('[DB] Saved filtered directions n'+result.result.n).lightGray,  )
            }
        })
    }
    if (!filteredCollection) {
        mongoClient.connect(url, function(err, database) {
            if (err) {
                return log('[DB]'.red, err.message.lightGray)
            } else {
                mongodb = database.db('stalker')
                // tickersCollection       = db.collection("tickers")
                // directionsCollection    = db.collection("AllDirections")
                filteredCollection = mongodb.collection("best-directions")
                insertMany(arr)
            }
        })
    } else insertMany(arr)

}

const delay = ms => new Promise(res => setTimeout(res, ms))

// let tickersCollection
// let directionsCollection
let filteredCollection

let d = {} // Main data variable

// d.exchangeNames = ccxt.exchanges
// let rmExchange = function( name ) {
//     d.exchangeNames.splice(d.exchangeNames.indexOf(name), 1)
// }
// // remove auth-needed exchanges
// rmExchange('_1broker')   // require api key
// rmExchange('bibox')
// // rmExchange('yunbi')      // 503 Service Temporarily Unavailable offline, on maintenance or unreachable from this location at the moment
// rmExchange('xbtce')      // require api key
// // rmExchange('bitstamp')   // TIMEOUT
// // rmExchange('exmo')       // request timed out (10000 ms)
// // rmExchange('braziliex')  // Not Accessed from my location yet
// // rmExchange('btctradeim')  // not accessible from this location at the moment
// // rmExchange('bxinth')     // Cloudflare not accessible from this location at the moment
// // rmExchange('ccex')       // Cloudflare not accessible from this location at the moment
// // rmExchange('coingi')     // Service Temporarily Unavailable Just a moment...
// rmExchange('bitfinex2')     // DDOS
// // No trade sources
// rmExchange('coinmarketcap')
// d.exchangeNames = ['hitbtc','hitbtc2','binance','yobit'] //VD
// d.exchangeNames = ['hitbtc','hitbtc2','binance','gateio',
//          'bittrex','kucoin','livecoin','dsx']
d.exchangeNames = ['binance','bittrex','poloniex']
/// -kraken
// -cryptopia
// -liqui
// -coinegg
// -dsx
// -ploniex
function colR( val, width=10) {
    let text = val.toString()
    let spaces = width-text.length
    while (spaces<=0) spaces+=width
    return Array(spaces).join(' ') + text
}
function colL( val, width=10) {
    let text = val ? val.toString() : 'undefined'
    let spaces = width-text.length
    while (spaces<=0) spaces+=width
    return text + Array(spaces).join(' ')
}
function propsCount( o ) {
    let count = 0
    for (let p in o) {
        if (o.hasOwnProperty(p)) {
            ++count
        }
    }
    return count
}

function aggregateTickers(exchangesReceived, exchangesTickers){
    // Aggregate ticks
    let ticks = {}
    // log('Aggregate')
    _.each( exchangesReceived, (exchangeName) => {
        const tickers = exchangesTickers[exchangeName]
        // log( exchangeName.blue, propsCount(tickers) )
        _.map( tickers, function( num, pair ) {
            // console.log( num, pair );
            let v = ticks[pair]
            if (!v) v = {}
            let a = tickers[pair]
            a['exchange'] = exchangeName
            a['pair'] = pair
            v[exchangeName] = tickers[pair]
            ticks[pair] =  v
            return ticks[pair]
        })
    })
    // console.log( 'Aggregated', ticks );
    // console.log( 'BTC/USD', ticks['BTC/USD'] );
    return ticks
}

function findDirections(ticks){
    let dirs = [] // directions
    _.each( ticks, (tick, pair) => {
        // log ( pair )
        const exs = Object.keys(tick)
        if (exs.length>1) {
            // log( pair, exs )
            const tickAsk = _.sortBy( tick, 'ask' )
            const tickBid = _.sortBy( tick, 'bid' )
            // console.log( tick )
            const f = _.first( tickAsk )
            const l = _.last( tickBid )
            const difLast = l.last/f.last*100-100
            const difBidAsk = l.bid/f.ask*100-100
            const difdif = Math.abs(difLast-difBidAsk)
            // console.log( pair, f.exchange, l.exchange, difBidAsk.toFixed(2) )
            const dir = {}
            dir.pair = pair
            dir.exBuy = f
            dir.exSell = l
            dir.exBuyName = f.exchange
            dir.exSellName = l.exchange
            const minQuoteVolume = Math.min(
                f.quoteVolume,
                l.quoteVolume)
            dir.difLast = difLast
            dir.difBidAsk = difBidAsk
            dir.difdif = difdif
            dir.minQuoteVolume = minQuoteVolume
            dirs.push(dir);
        }
    })
    return _.sortBy(dirs, 'difBidAsk' )
}

function filterDirections(directions, quote=null, minQuoteVolume=1, minDifBidAsk=2, maxDifDif=10000){
    const filteredDirections = []
    _.each( directions, (dir) => {
        // log( name, 'Tick', tick )

        if (dir.minQuoteVolume>=minQuoteVolume
            && dir.difBidAsk>=minDifBidAsk //&& tick.exBuy.ask>0
            && dir.exBuyName!==dir.exSellName
            && dir.difdif<=maxDifDif
        && (!quote || dir.pair.indexOf('/'+quote) !== -1)
        ) {
            filteredDirections.push(dir)
        }
    })
    return filteredDirections
}

async function getAllTickers() {
    d.tr = {}
    d.exchangesReceived = []
    d.exchanges = {}

    let exchangesReceivedCount = 0 // For now use exchanges with 'get all tickers at once' feature
    await Promise.all( d.exchangeNames.map( async name => {
        try {
            let exchange = new ccxt[name] ()
            log(name)
            exchange.key    = keys[name].key
            exchange.secret = keys[name].secret
            d.exchanges[name] = exchange
            let markets = await exchange.loadMarkets()
            d.exchanges[name].markets = markets
            await delay(1000)
            let tickers = await exchange.fetchTickers() // Not all exchanges supports 'get all in once'
            d.exchanges[name].tickers = tickers
            d.tr[name] = tickers
            d.exchangesReceived.push(name)
            // log(' ')
            log( ++exchangesReceivedCount, ".", colL(name.green), colR(propsCount(tickers)),
                exchange.has.deposit?'+':'-', exchange.has.withdraw?'+':'-' )
            // const currency = exchange.currencies['ETH']
            // log('ETH precision:',currency.precision, 'fee:',colL(currency.fee),
            //     'Address:',currency.address)
            // log(currency)
            // log( exchange.has)
            // findMaxProfit()
        } catch (e) {
            if (e.message.indexOf('fetchTickers')===-1 ) {
                if (e.message.indexOf(' GET ') === -1)
                    log('[UNHANDLED]'.red, e.message, e)
                else
                    log( '[TIMEOUT]'.lightGray, name)
            }
        }

    }))
}

function printDirections(directions){
    _.each( directions, (tick) => {
        // if (d.exchanges[tick.exBuyName].has.withdraw &&
        //     d.exchanges[tick.exSellName].has.deposit)
        if (tick) log(
            colR(tick.difLast.toFixed(2)+'%'),
            colR(tick.difBidAsk.toFixed(2)+'%'),
            colR(tick.difdif.toFixed(0)+'%',5),
            colR(tick.estimatedProfit ? tick.estimatedProfit.toFixed(2)+'%': ''),
            colR(tick.pair.blue),
            colR(tick.minQuoteVolume.toFixed(0)), _tab,
            // d.exchanges[tick.exBuyName].has.deposit?'+':'-',
            // d.exchanges[tick.exBuyName].has.withdraw?'+':'-', '->',
            // d.exchanges[tick.exSellName].has.deposit?'+':'-',
            // d.exchanges[tick.exSellName].has.withdraw?'+':'-',
            // _tab,
            colR(tick.exBuyName), '->', colL(tick.exSellName),
            colL(tick.stopMsg ? tick.stopMsg : ' ').darkGray
        )
    })
}

function findMaxProfit() {
    // console.time("findMaxProfit");
    const ticks = aggregateTickers(d.exchangesReceived, d.tr)

    // Find directions
    const directions = findDirections(ticks)
    d.directions = directions // save in global object

    const filteredDirections = filterDirections(directions, null, 5, 5, 5)
    d.filteredDirections = filteredDirections

    // d.bestDirection = _.last(filterDirections(directions, 'ETH', 5, 5, 20))
    // d.bestDirection = _.last(filterDirections(directions, null, 5, 5, 5))

    // console.timeEnd("findMaxProfit");
    // log( '')
    // log( 'Best pairs for', Object.keys(d.tr).length, 'exchanges')
    // printDirections(filteredDirections)
}

function findOrderPriceLimit( lots, amount, accumulateLots=true ) {
    let price = Infinity
    for (let i=0; amount>0 && i<lots.length; i++) {
        let lotPrice = lots[i][0]
        let lotAmount = lots[i][1]
        if (lotAmount<amount) {
            if (accumulateLots) amount -= lotAmount
            price = lotPrice //? if accumulate lots calc precise price
        } else {
            amount = 0
            price = lotPrice
        }
    }
    if (amount>0) price = Infinity
    return price
}

function print_calcOrderPriceLimit( orderBook ) {
    for (let a=1; a>=0.00001; a/=10) {
        const sellPrice = findOrderPriceLimit( orderBook.bids, a)
        const buyPrice  = findOrderPriceLimit( orderBook.asks, a)
        log('Amount: ', a,_tab, buyPrice, _tab, sellPrice)
    }
}

async function estimateDirectionProfit(direction, exBuyOrderBook, exSellOrderBook, budget) {
    log( 'estimateDirectionProfit'.lightGray, 'budget:', budget, colR(direction.pair.blue),
        direction.exBuyName, '->', direction.exSellName)
    // log(direction)

    let quoteBalance = budget
    const startQuoteBalance = quoteBalance
    const exBuy  = d.exchanges[direction.exBuyName]
    const exSell = d.exchanges[direction.exSellName]
    const buyMarket  = exBuy.markets[direction.pair]
    const sellMarket = exSell.markets[direction.pair]
    const buyTicker  = exBuy.tickers[direction.pair]
    const sellTicker = exSell.tickers[direction.pair]
    const base  = buyMarket.base
    const quote = buyMarket.quote


    //BUY BASE ASSETS ON MAIN EXCHANGE
    log('Buying', base, 'for', budget, quote, 'on', direction.exBuyName)
    log('buyMarket',buyMarket)
    //FIND BEST PRICE FOR BUDGET IN BUY EXCHANGE MARKET ORDERS
    //BUY (CONVERT)
    const buyMarketFee = buyMarket.taker
    const budgetWOFee  = budget - (budget*buyMarketFee)
    //FIND BEST ASK PRICE FOR BUDGET
    const buyPrice = findOrderPriceLimit(exBuyOrderBook.asks, budget)
    assert(!(buyPrice==Infinity), 'buyPrice is Infinity (not enough bids for budget)')
    const baseAmount   = (budgetWOFee / buyPrice).toFixed(buyMarket.precision.amount)
    const buyCost      = baseAmount * buyPrice
    quoteBalance -= buyCost
    //DECREASE FEES
    const buyFee = buyCost * buyMarketFee
    quoteBalance -= buyFee
    const buyFullCost   = budgetWOFee + buyFee
    log('Purchase'.blue, baseAmount, base, 'by price', buyPrice, quote)
    log('for budget', buyCost, '+ fee', buyFee, '=',buyFullCost, quote)
        //REAL:
            //PLACE ORDER
            //WAIT FOR COMPLETE

    //TRANSFER BASE ASSETS
        //check base asset withdrawal
        //check withdrawal enabled (currency.status) on MAIN EXCHANGE
        //check minimum withdrawal amount
        //check maximum withdrawal amount
        //check base asset deposit address
        //check deposit enabled on SELL EXCHANGE
    log( base, exBuy.currencies[base])
    // const baseTransferFeeRate = //TODO
    const baseCurrency = exBuy.currencies[base]
    var baseTransferFeeRate
    let baseTransferFee = baseCurrency.fee
    if(!baseTransferFee) {
        baseTransferFeeRate = 0.01
        baseTransferFee = baseAmount * baseTransferFeeRate
        log('Unknown withdrawal fee. Suppose 1%'.yellow)
    }
    assert((typeof baseCurrency.active == 'undefined') || baseCurrency.active, base+' - base currency is not active')
    // assert(baseTransferFee,'baseTransferFee not defined')
    //TODO check fee defined
    // const baseTransferFeeCost = baseAmount * baseTransferFee
    const baseExpected = baseAmount - baseTransferFee
    // log('Transferring'.blue, baseAmount, 'fee', baseTransferFee, base, 'fee cost', baseTransferFeeCost, base, 'expected',baseExpected,base)
    log('Transferring'.blue, baseAmount, 'fee', baseTransferFee, base, 'expected',baseExpected,base)
        //REAL:
            //WITHDRAW
            //WAIT TRANFER COMPLETED (Check SELL EXCHANGE balance)

    //SELL ASSETS ON SELL EXCHANGE
    const sellMarketFee = sellMarket.taker
    // const sellPrice     = sellTicker.bid  //TODO Find in market orders
    //Find best bid price for budget
    const sellPrice = findOrderPriceLimit(exSellOrderBook.asks, budget)
    assert(!(sellPrice==Infinity), 'sellPrice is Infinity (not enough asks for budget)')
    const receivedAmount   = baseExpected //TODO set to
    const sellCost      = receivedAmount * sellPrice
    let quoteBalance2 = sellCost
    //DECREASE FEES
    const sellFee = sellCost * sellMarketFee
    quoteBalance2 -= sellFee
    const sellFullCost   = sellCost - sellFee
    log('Selling'.blue, receivedAmount, base, 'by price', sellPrice, quote)
    log('cost', sellCost, '+ fee', sellFee, '=',sellFullCost, quote)
        //REAL:
            //PLACE ORDER
            //WAIT FOR COMPLETE

    //TRANSFER QUOTE MONEY BACK TO MAIN EXCHANGE
    log( quote, exSell.currencies[quote])
        //check qote money withdrawal on EX2
        //check withdrawal enabled on SELL EXCHANGE
        //check qute money deposit address on EX1
        //check deposit enabled on MAIN EXCHANGE
        //decrease fee
    const quoteCurrency = exSell.currencies[quote]
    var quoteTransferFeeRate
    let quoteTransferFee = quoteCurrency.fee
    if(!quoteTransferFee) {
        quoteTransferFeeRate = 0.01
        quoteTransferFee = quoteBalance2 * quoteTransferFeeRate
        log('Unknown withdrawal fee. Suppose 1%'.yellow)
    }
    assert((typeof quoteCurrency.active == 'undefined') || quoteCurrency.active, quote+' - quote currency is not active')
    // assert(baseTransferFee,'baseTransferFee not defined')
    //TODO check fee defined
    // const baseTransferFeeCost = baseAmount * baseTransferFee
    const quoteExpected = quoteBalance2 - quoteTransferFee
    // log('Transferring'.blue, baseAmount, 'fee', baseTransferFee, base, 'fee cost', baseTransferCost, base, 'expected',baseExpected,base)
    log('Transferring'.blue, quoteBalance2, quote, 'fee', quoteTransferFee, quote, 'expected',quoteExpected,quote)
        //REAL:
            //WITHDRAW FROM SELL EXCHANGE TO BUY EXCHANGE
            //WAIT TRANSFER COMPLETED (Check BUY EXCHANGE balance)
    quoteBalance += quoteExpected
    const profit = quoteBalance / startQuoteBalance
    printDirections([direction])
    log('Profit'.green, (profit*100-100).toFixed(4)+'%', 'quote expected', quoteExpected, 'start balance',
        startQuoteBalance, quote, 'end balance', quoteBalance, quote)
    return profit
}

async function scrape() {
// Store last calculated directions (if any)
    log('Scrape started')
    await getAllTickers()
    log('All tickers fetched')

    findMaxProfit()
    if (d.filteredDirections && d.filteredDirections.length>0) {
        log('Saving to DB filtered directions'.lightGray)
        printDirections( d.filteredDirections )
        // console.log(d.filteredDirections)
        // dbInsertMany(d.filteredDirections)

        var bestDirection, bestBudget
        let bestEstimatedProfit = 0

        for (let i=0; i<d.filteredDirections.length; i++) {
            const direction = d.filteredDirections[i]
            log(' ')
            log('Estimate direction'.blue)
            printDirections([direction])
            // log( 'Best direction'.green, d.bestDirection)
            const exBuy  = d.exchanges[direction.exBuyName]
            const buyMarket  = exBuy.markets[direction.pair]
            const quote = buyMarket.quote

            let budget = 0.05
            if (quote=='BTC')  budget = 0.02
            if (quote=='ETH')  budget = 0.4
            if (quote=='USDT') budget = 200

            const exBuyOrderBook  = await d.exchanges[direction.exBuyName].fetchL2OrderBook(direction.pair)
            const exSellOrderBook = await d.exchanges[direction.exSellName].fetchL2OrderBook(direction.pair)
            await delay(1000) //TODO optimise (wait 1000-(currenttime-lastrequesttime for exchange))
            try {
                const estimatedProfitRate = await estimateDirectionProfit(direction, exBuyOrderBook, exSellOrderBook, budget)
                const estimatedProfit = (estimatedProfitRate * 100 - 100)
                direction.estimatedProfit = estimatedProfit
                if (estimatedProfit>bestEstimatedProfit) {
                    bestEstimatedProfit = estimatedProfit
                    bestDirection = direction
                    bestBudget = budget
                }
            } catch(e) {
                log('[EST] '+e.message.toString().red)
                direction.stopMsg = e.message
            }
        }
        if(bestDirection) {
            log(' ')
            printDirections(d.filteredDirections)
            dbInsertMany(d.filteredDirections)
            log(' ')
            log('Best estimated profit'.yellow, bestEstimatedProfit.toFixed(2), '% for budget', bestBudget)
            bestDirection.bestEstimatedProfit = bestEstimatedProfit
            bestDirection.bestBudget = bestBudget
            printDirections([bestDirection])
        }else{
            log('No best direction found'.yellow)
        }

    }

}

scrape()

// db.close();




