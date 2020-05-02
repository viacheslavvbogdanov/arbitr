/*
 * Copyright (c) 2018. Viacheslav V Bogdanov
 * viacheslav.v.bogdanov@gmail.com
 */

/* TODO
- emulate twins strategy
- calc balance
- save balance to db

- get API keys for exchanges with no public API:
        digifinex flowbtc okex
 */

"use strict"
const assert = require('assert')
const ccxt   = require('ccxt')
const _      = require('underscore')
const log    = require ('ololog').configure ({ locate: true })
require ('ansicolor').nice
const delay = ms => new Promise(res => setTimeout(res, ms))
const _tab="\t"
//const keys = require ('./keys.js')
// const keys = []

const DEBUG = false
const debug = DEBUG ? log : function(){};

const config = {
    minDifBidAsk: 10,  // in percents
    maxDifDif:    20,
    mongoDBCollection: "chances5"
}

let d = {} // Main data variable

d.exchangeNames = ccxt.exchanges
// let rmExchange = function( name ) {
//     d.exchangeNames.splice(d.exchangeNames.indexOf(name), 1)
// }
// // remove some exchanges
// rmExchange('_1broker')   // require api key
// d.exchangeNames = ['hitbtc','gateio','livecoin', 'crex24', 'stex', 'kraken',
//     'whitebit','hitbtc2','bitz','exmo']//,'livecoin']


const mongoClient = require("mongodb").MongoClient
const url = "mongodb://localhost:27017/stalker"
// { "insertTime": {"$toDate":"$_id" }}
let mongodb
let mongoCollection
function dbInsertMany(arr) {
    const insertMany = function(arr){
        const timeStamp = new Date(Date.now()).toISOString()
        _.each(arr, item => {
            item.timeStamp = timeStamp;
        })
        mongoCollection.insertMany(arr, function(err, result){
            if(err){
                return log('[DB]'.red, result, err)
            } else {
                log(('[DB] Saved docs count:'+result.result.n).lightGray,  )
            }
        })
    }
    if (!mongoCollection) {
        mongoClient.connect(url, function(err, database) {
            if (err) {
                return log('[DB]'.red, err.message.lightGray)
            } else {
                mongodb = database.db('stalker')
                mongoCollection = mongodb.collection(config.mongoDBCollection)
                insertMany(arr)
            }
        })
    } else insertMany(arr)
}

function colR( val, width=12) {
    let text = val.toString()
    let spaces = width-text.length
    while (spaces<=0) spaces+=width
    return Array(spaces).join(' ') + text
}
function colL( val, width=12) {
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
            const difDif = Math.abs(difLast-difBidAsk)
            // console.log( pair, f.exchange, l.exchange, difBidAsk.toFixed(2) )
            const dir = {}
            dir.pair = pair
            dir.exBuy = f
            dir.exSell = l
            dir.exBuyName = f.exchange
            dir.exSellName = l.exchange
            dir.direction = f.exchange+' -> '+l.exchange
            dir.chance = dir.direction+' ('+dir.pair+')'
            const minQuoteVolume = Math.min(
                f.quoteVolume,
                l.quoteVolume)
            dir.difLast = difLast
            dir.difBidAsk = difBidAsk
            dir.difdif = difDif
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
            // console.log('exchange', exchange)
            exchange.timeout = 30000
            // exchange.key    = keys[name].key
            // exchange.secret = keys[name].secret
            d.exchanges[name] = exchange
            let markets = await exchange.loadMarkets()
            d.exchanges[name].markets = markets
            // console.log('markets', markets)
            await delay(1000)

            let currencies = await exchange.fetchCurrencies()
            d.exchanges[name].currencies = currencies
            await delay(1000)

            let allTickers = await exchange.fetchTickers() // Not all exchanges supports 'get all in once'
            let tickers = {} //
            _.each( allTickers, (ticker, pair) => {
                const market = markets[pair]
                if( market && market.active  &&
                    currencies[market.base]  && currencies[market.base].active &&
                    currencies[market.quote] && currencies[market.quote].active
                ) tickers[pair] = ticker
            })
            //console.log('tickers', tickers)

            d.exchanges[name].tickers = tickers
            d.tr[name] = tickers
            d.exchangesReceived.push(name)
            // log(' ')
            log( ++exchangesReceivedCount, ".", colL(name.green), colR(propsCount(tickers)),
                exchange.has.deposit?'D+':'d-'.darkGray,
                exchange.has['fetchDepositAddress']?'FD+':'fd-'.darkGray,
                exchange.has['createDepositAddress']?'CD+':'cd-'.darkGray,
                exchange.has.withdraw?'W+':'w-'.darkGray )
            // const currency = exchange.currencies['ETH']
            // log('ETH precision:',currency.precision, 'fee:',colL(currency.fee),
            //     'Address:',currency.address)
            // log(currency)
            // log( exchange.has)
            // findMaxProfit()
        } catch (e) {
            if (e.message.indexOf('fetchTickers')===-1 ) {
                if (e.message.indexOf(' GET ') === -1) {
                    log('[UNHANDLED]'.red, e.message)
                    //log(e)
                    //debug(e)
                } else
                    log( '[TIMEOUT]'.lightGray, name)
            }
        }

    }))
}

function printDirections(directions, sortByField='difBidAsk'){
    log(
        colR(''),
        colR('difBidAsk'.green),
        colR('difLast'.green),
        colR('dif'.green,5),
        colR('pair'.green,12),
        colR('minQVol'.green), _tab,
        // d.exchanges[tick.exBuyName].has.deposit?'+':'-',
        // d.exchanges[tick.exBuyName].has.withdraw?'+':'-', '->',
        // d.exchanges[tick.exSellName].has.deposit?'+':'-',
        // d.exchanges[tick.exSellName].has.withdraw?'+':'-',
        // _tab,
        colR('exBuy'.green), '  ', colL('exSell'.green),
        colL('stopMsg'.green)
    )
    _.each( _.sortBy(directions,sortByField), (tick) => {
        // if (d.exchanges[tick.exBuyName].has.withdraw &&
        //     d.exchanges[tick.exSellName].has.deposit)
        if (tick) log(
            colR(tick.estimatedProfit ? tick.estimatedProfit.toFixed(2)+'%': ''),
            colR(tick.difBidAsk.toFixed(2)+'%'),
            colR(tick.difLast.toFixed(2)+'%'),
            colR(tick.difdif.toFixed(0)+'%',5),
            colR(tick.pair.blue, 12),
            colR(tick.minQuoteVolume.toFixed(0)), _tab,
            // d.exchanges[tick.exBuyName].has.deposit?'+':'-',
            // d.exchanges[tick.exBuyName].has.withdraw?'+':'-', '->',
            // d.exchanges[tick.exSellName].has.deposit?'+':'-',
            // d.exchanges[tick.exSellName].has.withdraw?'+':'-',
            // _tab,
            colR(tick.exBuyName), '->', colL(tick.exSellName),
            colL(tick.stopMsg ? tick.stopMsg : ' ').red
        )
    })
}

function findMaxProfit() {
    console.time("findMaxProfit");
    const ticks = aggregateTickers(d.exchangesReceived, d.tr)

    // Find directions
    const directions = findDirections(ticks)
    d.directions = directions // save to global object

    // const filteredDirections = filterDirections(directions, null, 5, 5, 5)
    d.filteredDirections = filterDirections(
        directions, null, 0, config.minDifBidAsk, config.maxDifDif)

    // d.bestDirection = _.last(filterDirections(directions, 'ETH', 5, 5, 20))
    // d.bestDirection = _.last(filterDirections(directions, null, 5, 5, 5))

    console.timeEnd("findMaxProfit");
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

// function print_calcOrderPriceLimit( orderBook ) {
//     for (let a=1; a>=0.00001; a/=10) {
//         const sellPrice = findOrderPriceLimit( orderBook.bids, a)
//         const buyPrice  = findOrderPriceLimit( orderBook.asks, a)
//         log('Amount: ', a,_tab, buyPrice, _tab, sellPrice)
//     }
// }

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
    // const buyTicker  = exBuy.tickers[direction.pair]
    // const sellTicker = exSell.tickers[direction.pair]
    const base  = buyMarket.base
    const quote = buyMarket.quote


    //BUY BASE ASSETS ON MAIN EXCHANGE
    log('Buying', base, 'for', budget, quote, 'on', direction.exBuyName)
    // log('buyMarket',buyMarket)
    //FIND BEST PRICE FOR BUDGET IN BUY EXCHANGE MARKET ORDERS
    //BUY (CONVERT)
    const buyMarketFee = buyMarket.taker
    const budgetWOFee  = budget - (budget*buyMarketFee)
    //FIND BEST ASK PRICE FOR BUDGET
    const buyPrice = findOrderPriceLimit(exBuyOrderBook.asks, budget)
    assert(!(buyPrice===Infinity), 'buyPrice is Infinity (not enough bids for budget)')
    const baseAmount   = exBuy.decimalToPrecision(
        (budgetWOFee / buyPrice), exBuy.TRUNCATE, buyMarket.precision.amount )
    const buyCost = baseAmount * buyPrice
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
    debug( base, exBuy.currencies[base])
    // const baseTransferFeeRate = //TODO
    const baseCurrency = exBuy.currencies[base]
    var baseTransferFeeRate
    let baseTransferFee = baseCurrency.fee
    if(!baseTransferFee) {
        baseTransferFeeRate = 0.0025
        baseTransferFee = baseAmount * baseTransferFeeRate
        log('Unknown withdrawal fee. Suppose '.yellow, baseTransferFeeRate*100,'%')
    }
    assert((typeof baseCurrency.active == 'undefined') || baseCurrency.active,
        base+' - base currency is not active')
    // assert(baseTransferFee,'baseTransferFee not defined')
    //TODO check fee defined
    // const baseTransferFeeCost = baseAmount * baseTransferFee
    const baseExpected = baseAmount - baseTransferFee
    // log('Transferring'.blue, baseAmount, 'fee', baseTransferFee, base, 'fee cost', baseTransferFeeCost, base, 'expected',baseExpected,base)
    log('Transferring'.blue, baseAmount, 'fee', baseTransferFee, base, 'expected',baseExpected,base)
    //REAL:
    //WITHDRAW
    //WAIT TRANSFER COMPLETED (Check SELL EXCHANGE balance)

    //SELL ASSETS ON SELL EXCHANGE
    const sellMarketFee = sellMarket.taker
    // const sellPrice     = sellTicker.bid  //TODO Find in market orders
    //Find best bid price for budget
    const sellPrice = findOrderPriceLimit(exSellOrderBook.asks, budget)
    assert(!(sellPrice===Infinity), 'sellPrice is Infinity (not enough asks for budget)')
    const receivedAmount = baseExpected //TODO set to
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
    debug( quote, exSell.currencies[quote])
    //check qote money withdrawal on EX2
    //check withdrawal enabled on SELL EXCHANGE
    //check qute money deposit address on EX1
    //check deposit enabled on MAIN EXCHANGE
    //decrease fee
    const quoteCurrency = exSell.currencies[quote]
    var quoteTransferFeeRate
    let quoteTransferFee = quoteCurrency.fee
    if(!quoteTransferFee) {
        quoteTransferFeeRate = 0.0025
        quoteTransferFee = quoteBalance2 * quoteTransferFeeRate
        log('Unknown withdrawal fee. Suppose '.yellow, quoteTransferFeeRate*100,'%')
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

async function emulateDirections() {
    if (d.filteredDirections && d.filteredDirections.length>0) {
        // log('Saving to DB filtered directions'.lightGray)
        //printDirections( d.filteredDirections )
        // console.log(d.filteredDirections)
        // dbInsertMany(d.filteredDirections)

        var bestDirection, bestBudget
        let bestEstimatedProfit = 0

        for (let i=0; i<d.filteredDirections.length; i++) {
            const direction = d.filteredDirections[i]
            try {
                log( "\n\n")
                log('Estimate direction'.blue)
                printDirections([direction])
                // log( 'Best direction'.green, d.bestDirection)
                const exBuy  = d.exchanges[direction.exBuyName]
                const buyMarket  = exBuy.markets[direction.pair]
                const quote = buyMarket.quote

                let budget = 0.05
                if (quote==='BTC')  budget = 0.02
                if (quote==='ETH')  budget = 0.5
                if (quote==='USDT') budget = 100

                const exBuyOrderBook  = await d.exchanges[direction.exBuyName].fetchL2OrderBook(direction.pair)
                const exSellOrderBook = await d.exchanges[direction.exSellName].fetchL2OrderBook(direction.pair)
                await delay(1000) //TODO optimise (wait 1000-(currenttime-lastrequesttime for exchange))

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
            printDirections(d.filteredDirections, 'estimatedProfit')
            dbInsertMany(d.filteredDirections)
            log(' ')
            log('Best estimated profit'.yellow, bestEstimatedProfit.toFixed(2), '% for budget', bestBudget)
            bestDirection.bestEstimatedProfit = bestEstimatedProfit
            bestDirection.bestBudget = bestBudget
            printDirections([bestDirection])
            log()
        }else{
            log('No best direction found'.yellow)
        }

    }

}

async function scrape() {
    log('Scrape started')
    console.time("getAndFind");
    await getAllTickers()
    log('All tickers fetched')

    findMaxProfit()
    printDirections( d.filteredDirections )
    // dbInsertMany(d.filteredDirections)
    console.timeEnd("getAndFind");

    await emulateDirections()
}

let working = true;

(async () => {
    do {
        await scrape()
        await delay(60000)
    } while (working)
})()
// db.close();

/*
otes On Precision And Limits
The user is required to stay within all limits and precision! The values of the order should satisfy the following conditions:

Order amount >= limits['min']['amount']
Order amount <= limits['max']['amount']
Order price >= limits['min']['price']
Order price <= limits['max']['price']
Order cost (amount * price) >= limits['min']['cost']
Order cost (amount * price) <= limits['max']['cost']
Precision of amount must be <= precision['amount']
Precision of price must be <= precision['price']
 */




