/*
 * Copyright (c) 2018. Viacheslav V Bogdanov
 * viacheslav.v.bogdanov@gmail.com
 */

"use strict"

const ccxt   = require('ccxt')
const _      = require('underscore')
const assert = require('assert')
const BN     = require('bignumber.js')
const log    = require ('ololog').configure ({ locate: false })
require ('ansicolor').nice
const _tab="\t"
const ants = require ('./cryptoants.js')

const delay = ms => new Promise(res => setTimeout(res, ms))

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

async function findGoodLoop(exchange, params) {
    const name = params.exchange
    try {
        // log (exchange.has)
        let startTime = Date.now()
        let tickers = await exchange.fetchTickers() // Not all exchanges supports 'get all in once'
        let responseTime = Date.now()-startTime

        if (!exchange.loops) {
            const timeLoopsCalc = 'Loops calculation '+name
            console.time(timeLoopsCalc)
            exchange.markets = await exchange.loadMarkets() //TODO refresh daily in long-time processes
            // await delay(1000) //TODO Optimize
            const graph = ants.createGraph(exchange.markets)
            exchange.loops = ants.findLoops(graph, 3)
            console.timeEnd(timeLoopsCalc)
        }
        const markets = exchange.markets
        const loops = exchange.loops
        const allChains = ants.findChains(name, markets, loops, tickers)
        const unsortedChains =
            ants.filterChains(
                allChains, params.minProfit, params.minVolume, params.symbol)
        const chains = _.sortBy(unsortedChains, 'profit' )

        if (chains.length>0) {
            log(' ')
            log( (' '+name+' ').blue.bgLightGray, _tab,
                propsCount(markets), 'markets', _tab,
                loops.length, 'loops', _tab,
            (responseTime/1000).toFixed(3)+'ms' )
            ants.printChains(chains)
        }
        const chain = _.last(chains)
        if (chain) {
            log('Choosed:'.blue)
            ants.printChains([chain])
            // log(chain)
            // processChain(exchange, chain, tradeAmount)
        } else {
            log('Good deals not found'.yellow)
        }
        return chain


    } catch (e) {
        if (e.message.indexOf('fetchTickers')===-1 ) {
            if (e.message.indexOf(' GET ') === -1)
                log('[UNHANDLED]'.red, e.message, e)
            else
                log( '[TIMEOUT]'.lightGray, name)
        }
    }
}

async function getBalance(exchange, simulated=false) {
    let balance
    if (simulated) {
        balance = exchange.simulated.balance
    } else {
        balance = await exchange.fetchBalance()
    }
    log('All Balances'.green )
    _.each(balance, (b, name)=>{
        if (b['total']) log(name, b)
    })
    return balance
}

async function processChain(exchange, chain, tradeAmount, simulated=false ){
    // log( chain)
    let maxTradeAmount = tradeAmount // max amount is trade amount for first step

    let lastOrder = null
    for (let stepNum in chain.steps) {
        let step = chain.steps[stepNum]
        const balance = await getBalance(exchange, simulated)
        if (!simulated) await delay(1000) //TODO optimize speed
        const getFreeBalance = function (currency) {
            const b = balance[currency]
            return b ? b.free : 0
        }

        const quoteCurrency = step.market.quote
        const baseCurrency  = step.market.base

        const quoteBalance = getFreeBalance(quoteCurrency)
        const baseBalance  = getFreeBalance(baseCurrency)

        const amountMin = step.market.limits.amount.min
        const amountMax = step.market.limits.amount.max

        const quotePrecision  = exchange.currencies[quoteCurrency]['precision']
        const basePrecision   = exchange.currencies[baseCurrency]['precision']
        const amountPrecision = step.market.precision.amount
        log('step.market'.blue,step.market)
        // const lot = step.market.lot || 1

        log('Quote:', quoteCurrency, 'precision:', quotePrecision, 'balance:'.blue, quoteBalance)
        log('Base :', baseCurrency,  'precision:', basePrecision,  'balance:'.blue,  baseBalance)
        // log('Lot  :', lot, baseCurrency)
        log('Minimum amount limit:', step.market.limits.amount.min )

        var _rawPrice, _rawAmount

        if (step.isSell) { // SELL

            assert(!(stepNum == 0 && baseBalance < tradeAmount), 'First step amount is not enough to sell. balance:'.yellow + baseBalance)
            if (stepNum > 0) maxTradeAmount = baseBalance // use all balance for next steps

            _rawAmount = BN(maxTradeAmount.toString())
            _rawPrice = BN(findOrderPriceLimit( step.orderBook.bids, _rawAmount.toNumber() ))
            // _rawPrice  = BN(step.ticker.bid)

        } else { // BUY

            assert(!(stepNum == 0 && quoteBalance < tradeAmount), 'First step amount is not enough to buy. balance:'.yellow + quoteBalance )
            if (stepNum > 0) maxTradeAmount = quoteBalance // not for first step trade all amount

            _rawAmount = BN(maxTradeAmount.toString()).times(step.rate.toString()).times(BN(1).minus(step.fee))
            _rawPrice = BN(findOrderPriceLimit( step.orderBook.asks, _rawAmount.toNumber() ))
            // _rawPrice  = BN(step.ticker.ask)
        }

        // const _lotAmount = _rawAmount.div(lot).decimalPlaces(0,BN.ROUND_FLOOR).times(lot)
        log('maxTradeAmount',maxTradeAmount)
        log('_rawAmount',_rawAmount.toString())
        log('_rawPrice ',_rawPrice.toString())

        const _amount = _rawAmount.decimalPlaces(basePrecision,  BN.ROUND_FLOOR)
        const _price  = _rawPrice.decimalPlaces( quotePrecision, BN.ROUND_FLOOR)
        log( '_amount', _amount.toString(), '_price', _price.toString())
        assert(_amount.gte(amountMin), ('Step amount is not enough. Min:' + amountMin+' amount:'+_amount.toString()).yellow)
        assert(_amount.lte(amountMax||Infinity), ('Step amount over limit. Max:' + amountMax+' amount:'+_amount.toString()).yellow)

        // log(step)
        log(step.pair, _tab, step.isSell ? 'SELL' : 'BUY', _tab, quoteCurrency.blue, _tab,
            'max amount'.green, maxTradeAmount, _tab, 'order amount:'.blue, _amount.toString())

        log(step.isSell ?
            ('SELL bid: ' + step.ticker.bid).blue : ('BUY  ask: ' + step.ticker.ask).blue,
            'order for amount'.green, _amount.toString(), 'processing'.green)

        log('Price   :', _price.toString())

        // PLACE ORDER
        lastOrder = await completeLimitOrder(exchange, step.pair, step.isSell, _amount.toNumber(), _price.toNumber(), simulated)

        // log( 'lastOrder'.green, lastOrder)
        assert(lastOrder.status==='open', 'Error placing order'.red + lastOrder)
        if (!simulated) await delay(1000)

    }
    return chain
}

// async function processChain(exchange, chain, tradeAmount, simulated=false ){
//     // log( chain)
//     let maxAmount = tradeAmount // max amount is trade amount for first step
//     let lastOrder = null
//     for (let stepNum in chain.steps) {
//         let step = chain.steps[stepNum]
//         const balance = await getBalance(exchange, simulated)
//         await delay(1000)
//         const currency = step.market.quote
//
//         log(currency, 'balance:'.blue, balance[currency])
//         if (stepNum==0 && balance[currency].free<maxAmount) {
//             log(maxAmount, 'First step amount is not enough to trade. balance:'.red, balance[currency].free)
//         } else {
//             if (stepNum > 0) maxAmount = balance[currency].free // not for first step trade all amount
//
//             const rawAmount = step.isSell ?
//                 maxAmount : maxAmount * step.rate * (1 - step.fee)
//             const amount = rawAmount.toFixed(step.market.precision.amount)
//             // TODO? Update ticker for pair?
//             const rawPrice = step.isSell ? step.ticker.bid  : step.ticker.ask
//             // .currencies['ETH']['precision']
//             const price = rawPrice.toFixed(exchange.currencies[currency]['precision'])
//             // const price = rawPrice.toFixed(step.market.precision.price)
//
//             log(step)
//             log(step.pair, _tab,
//                 step.isSell ? 'SELL' : 'BUY', _tab,
//                 currency.blue, _tab,
//                 'max amount'.green, maxAmount, _tab,
//                 'order amount:'.blue, amount)
//             if (amount < step.market.limits.amount.min) { // TODO check max limit also
//                 log(amount, 'Step amount is not enough to trade. min:'.red, step.market.limits.amount.min)
//             } else {
//                 log(step.isSell ?
//                     ('SELL bid: '+step.ticker.bid).blue :
//                     ('BUY  ask: '+step.ticker.ask).blue,
//                     'order for amount'.green, amount, 'processing'.green)
//                 log( 'Price   :',price )
//                 lastOrder = await completeLimitOrder( exchange, step.pair, step.isSell, amount, price, simulated)
//                 // log('LastOrder'.blue, lastOrder)
//             }
//         }
//     }
//     return chain
//
// }

// async function processChain(exchange, chain, tradeAmount, discount=0.5 ){
//     // log( chain)
//     let maxAmount = tradeAmount // max amount is trade amount for first step
//     let lastOrder = null
//     for (let stepNum in chain.steps) {
//         let step = chain.steps[stepNum]
//         const balance = await getBalance(exchange)
//         await delay(1000)
//         // TODO remove discount - use accurate data
//         const stepDiscount = chain.profit / chain.stepsCount * discount
//         // const stepDiscount = 0
//         log('Step discount:'.yellow, (stepDiscount*100).toFixed(2),'%')
//         const currency = step.market.quote
//
//         log(currency, 'balance:'.blue, balance[currency])
//         if (stepNum==0 && balance[currency].free<maxAmount) {
//             log(maxAmount, 'First step amount is not enough to trade. balance:'.red, balance[currency].free)
//         } else {
//             if (stepNum > 0) maxAmount = balance[currency].free // not for first step trade all amount
//
//             const rawAmount = step.isSell ?
//                 maxAmount : maxAmount * step.rate * (1 - step.fee)
//             const amount = rawAmount.toFixed(step.market.precision.amount)
//             // TODO? Update ticker for pair?
//             const rawPrice = step.isSell ? step.ticker.bid  : step.ticker.ask
//             // .currencies['ETH']['precision']
//             const price = rawPrice.toFixed(exchange.currencies[currency]['precision'])
//             // const price = rawPrice.toFixed(step.market.precision.price)
//
//             log(step)
//             log(step.pair, _tab,
//                 step.isSell ? 'SELL' : 'BUY', _tab,
//                 currency.blue, _tab,
//                 'max amount'.green, maxAmount, _tab,
//                 'order amount:'.blue, amount)
//             if (amount < step.market.limits.amount.min) { // TODO check max limit also
//                 log(amount, 'Step amount is not enough to trade. min:'.red, step.market.limits.amount.min)
//             } else {
//                 log(step.isSell ?
//                     ('SELL bid: '+step.ticker.bid).blue :
//                     ('BUY  ask: '+step.ticker.ask).blue,
//                     'order for amount'.green, amount, 'processing'.green)
//                 log( 'Price   :',price )
//                 lastOrder = await completeLimitOrder(
//                     exchange, step.pair, step.isSell, amount, price)
//                 log('LastOrder'.blue, lastOrder)
//             }
//         }
//     }
//     return lastOrder
// }

function getSimulatedBalance( exchange, currency) {
    const b = exchange.simulated.balance[currency]
    return b ? b.free : 0
}

function setSimulatedBalance( exchange, currency, value) {
    if (!exchange.simulated.balance[currency]) {
        exchange.simulated.balance[currency] = {}
    }
    const b = exchange.simulated.balance[currency]
    b.free = value
    b.total = value
}

function simulateLimitSellOrder(exchange, pair, amount, price){
    log( pair, 'SELL simulateLimitSellOrder amount/price', amount, price)
    let order = {simulated:true,side:'sell',price:price, amount:amount}
    const market = exchange.markets[pair]
    const quoteCurrency = market.quote
    const baseCurrency  = market.base
    const cost = amount * price
    try {
        order.fee = {currency:quoteCurrency,rate:market.taker,cost:cost*market.taker}
        order.cost = cost - order.fee.cost
        order.status = 'open'
        assert(getSimulatedBalance(exchange, baseCurrency) >= amount, 'Insuff base currency '+baseCurrency)
        setSimulatedBalance(exchange, baseCurrency,  getSimulatedBalance(exchange, baseCurrency) - amount )
        setSimulatedBalance(exchange, quoteCurrency, getSimulatedBalance(exchange, quoteCurrency) + order.cost )
    } catch (e) {
        order.error = e
        order.status = 'canceled'
    }
    return order
}

function simulateLimitBuyOrder(exchange, pair, amount, price){
    log( pair, 'BUY simulateLimitBuyOrder amount/price', amount, price)
    let order = {simulated:true,side:'buy',price:price, amount:amount}
    const market = exchange.markets[pair]
    const quoteCurrency = market.quote
    const baseCurrency  = market.base
    const balance = exchange.simulated.balance
    const cost = amount * price
    try {
        order.fee = {currency:quoteCurrency,rate:market.taker,cost:cost*market.taker}
        order.cost = cost + order.fee.cost
        order.status = 'open'
        assert(getSimulatedBalance(exchange, quoteCurrency) >= order.cost, 'Insuff qoute currency '+quoteCurrency)
        setSimulatedBalance(exchange, quoteCurrency, getSimulatedBalance(exchange, quoteCurrency) - order.cost )
        setSimulatedBalance(exchange, baseCurrency,  getSimulatedBalance(exchange, baseCurrency) + amount )
    } catch (e) {
        order.error = e
        order.status = 'canceled'
    }
    return order
}

async function placeLimitSellOrder(exchange, pair, amount, price, simulated=false) {
    return simulated ?
        simulateLimitSellOrder(exchange, pair, amount, price) :
        await exchange.createLimitSellOrder(pair, amount, price)
}

async function placeLimitBuyOrder(exchange, pair, amount, price, simulated=false) {
    return simulated ?
        simulateLimitBuyOrder(exchange, pair, amount, price) :
        await exchange.createLimitBuyOrder(pair, amount, price)
}

async function completeLimitOrder( exchange, pair, sell, amount, price, simulated=false){
    log(sell?'SELL':'BUY', pair, 'completeLimitOrder'.blue, 'amount', amount, 'price', price, simulated?'SIMULATED':'REAL' )
    // exchange.verbose = true
    let order = sell ?
        await placeLimitSellOrder(exchange, pair, amount, price, simulated) :
        await placeLimitBuyOrder(exchange, pair, amount, price, simulated);
    log('Order placed'.green, order)
    // TODO Check for kucoin fetch order return always open
    // TODO insuff balance check
    // while (order.status==='open') {
    //     await delay(1000)
    //     log(_tab, 'fething order status...')
    //     order = await exchange.fetchOrder(order.id, pair, {type:sell?'SELL':'BUY'})
    //     log(order)
    //     // TODO cancel order if it open too long (>10 sec)
    //     // TODO log cancelled order, profit, step profit, discount
    // }
    return order
}

// async function completeMarketOrder( exchange, pair, sell, amount){
//     log('Amount'.blue, amount)
//     // exchange.verbose = true
//     let order = sell ?
//         await exchange.createMarketSellOrder( pair, amount):
//         await exchange.createMarketBuyOrder( pair, amount);
//     log( 'Order placed'.green, order )
//     while (order.status==='open') {
//         await delay(1000)
//         log(_tab, 'fething order status...')
//         order = await exchange.fetchOrder(order.id)
//         log(order)
//     }
//     return order
// }


// function calculateProfitAccurate(chain) {
//     return chain
// }
//
// function reviewChain(chain){
//     const chainOB = getChainOrderBooks(chain)
//     const reviewedChain = calculateProfitAccurate(chainOB)
//     return reviewedChain
//}

function findOrderPriceLimit( lots, amount, accumulateLots=false ) {
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

async function getChainOrderBooks(exchange, chain) {
    for (let stepNum in chain.steps) {
        let step = chain.steps[stepNum]
        // log(step)
        log(step.pair.blue, step.isSell ? 'SELL' : 'BUY',
            'Sellers ASK:',step.ticker.ask, 'Buyers BID:',step.ticker.bid)
        const orderBook = await exchange.fetchL2OrderBook(step.pair)
        await delay(1000) //TODO Optimize
        chain.steps[stepNum].orderBook = orderBook

        exchange.simulated.orderBook[step.pair] = orderBook
        log( 'Buyers  Bids', _.first(orderBook.bids, 10) )
        log( 'Sellers Asks', _.first(orderBook.asks, 10) )
        print_calcOrderPriceLimit(orderBook)
    }
    return chain
}

const startSymbol = 'ETH'
const startSimulatedBalance = 0.1
const SIMULATED = true
function simulatorInit(exchange) {
    exchange.simulated = {}
    exchange.simulated.orderBook = {}
    simulatorInitBalance(exchange)
}

function simulatorInitBalance(exchange) {
    exchange.simulated.balance = {}
    exchange.simulated.balance[startSymbol] = {free:startSimulatedBalance}
}

async function main() {
    let profit = null
    const paramStr = process.argv[2]
    const consoleParams = paramStr? JSON.parse(paramStr) : null
    if (!consoleParams) {
        log('Please provide apiKey and secret'.red)
        process.abort()
    }

    const defaultParams = {
        exchange:'gateio',
        minProfit: 0.01,
        minVolume: 1,
        symbol: startSymbol,
        maxTradeAmount: 0.1
    }
    const params = _.extend(defaultParams,consoleParams)
    // log(params)
    let exchange = new ccxt[consoleParams.exchange] ()
    exchange.apiKey = consoleParams.apiKey
    exchange.secret = consoleParams.secret
    // log(exchange.has)

    while(true) {
        log(new Date().toLocaleTimeString(),
            ' BROKER: '.bgLightBlue, 'Looking for good deals... '.blue)
        simulatorInit(exchange)
        const loop = await findGoodLoop(exchange, params)
        // log(loop)
        if (loop) {
            const chain = await getChainOrderBooks(exchange, loop)
            // const chain = loop
            // ESTIMATE BEST TRADE AMOUNT
            let tradeAmount = 0.0001
            let maxProfit = 0
            let bestTradeAmount = 0
            while (tradeAmount < params.maxTradeAmount) {
                simulatorInitBalance(exchange)
                try {
                    const simStartingBalance = getSimulatedBalance(exchange, chain.startSymbol)
                    const simulated = await processChain(exchange, chain, tradeAmount, SIMULATED)
                    const simBalance = getSimulatedBalance(exchange, chain.startSymbol)
                    getBalance(exchange, SIMULATED)
                    log('simStartingBalance', simStartingBalance)
                    log('simBalance        ', simBalance)
                    const simProfit = simBalance - simStartingBalance
                    log('tradeAmount', tradeAmount)
                    log('Estimated profit  '.yellow, simProfit.toFixed(6))
                    log('Estimated profit %'.yellow, (simProfit / tradeAmount * 100).toFixed(4), '%')
                    if (simProfit > maxProfit) {
                        maxProfit = simProfit
                        bestTradeAmount = tradeAmount
                    }
                    // const order = await processChain(exchange, chain, params.tradeAmount)
                    // log('Process chain order'.blue, order)
                } catch (e) {
                    log('[SIM ERROR]'.yellow, e.message)
                }
                tradeAmount = tradeAmount * 2
            }
            log('---')
            log('bestTradeAmount', bestTradeAmount)
            log('Max profit  '.yellow, maxProfit.toFixed(6))
            log('Max profit %'.yellow, (maxProfit / bestTradeAmount * 100).toFixed(4), '%')
        } else log(_tab, '  no chain to process'.yellow)
        await delay(60*1000)
    }
}
main()




