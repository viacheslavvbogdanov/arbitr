/*
 * Copyright (c) 2020. Viacheslav V Bogdanov
 * viacheslav.v.bogdanov@gmail.com
 */

"use strict"
const assert = require('assert')
const ccxt   = require('ccxt')
const _      = require('underscore')
const log    = require ('ololog').configure ({ locate: true })
require ('ansicolor').nice
const delay = ms => new Promise(res => setTimeout(res, ms))

const DEBUG = true
const debug = DEBUG ? log : function(){};

let c = {
    e1name: 'hitbtc',
    e2name: 'livecoin',
    base:   'XAUR',
    quote:  'BTC',
    budget: 0.001, // in quote currency
    minProfit: 10 // in percents
}

// const PROXY = ''
let e1, e2 //exchanges objects

async function init(config) {
    if (config) c = {c,config} // apply
    debug('[INIT] Config:', c)
    c.pair = c.base+'/'+c.quote
    e1 = new ccxt[c.e1name] ()
    e2 = new ccxt[c.e2name] ()
    await update()
}

async function update() {
    try{
        await Promise.all([eUpdate(e1), eUpdate(e2)] )
    } catch(e) {
        log('[UPDATE]'.red, e.message)
        debug(e)
    }
}

async function eDelay(e) {
    debug(`delay ${e.rateLimit}ms`.darkGray )
    await delay(e.rateLimit)
}

async function eUpdate(e) {
    debug(`eUpdate ${e.name}` )
    await e.loadMarkets()
    await eDelay(e)
    await e.fetchCurrencies()
    await eDelay(e)
    // await e.fetchBalance()
    // await eDelay(e)

}

async function eCheck(e) {
    debug(`eCheck ${e.name}` )
    // TODO check it all
    // exchange active
    // top-up active
    // withdrawal active
    // market active
    // base currency active
    // quote currency active
    // top-up of currency active
    // withdrawal of currency active
}

async function check() {
    await Promise.all([eCheck(e1), eCheck(e2)])
}

async function watch() {
    // WATCH (CHECK, ESTIMATE, MAKE (TRADE -> WAIT -> TRANSFER -> WAIT)
    try {
        // check exchanges and currencies
        await check()
        const estimation = await estimate()
        if (estimation.profit>=c.minProfit) {
            log('[GOOD DEAL!] Estimated profit:'.green, estimation.profit)
            await make(estimation)
        }

    } catch(e) {
        log('[CHECK]'.red, e.message)
        debug(e)
    }
}
async function estimate() {
    await Promise.all([fetchOrderBook(e1), fetchOrderBook(e2)])

    let buySellProfit = estimateProfit(e1,e2)
    let sellBuyProfit = estimateProfit(e2,e1)

    let estimation = buySellProfit>sellBuyProfit ?
        {profit:buySellProfit, forward:true} :
        {profit:sellBuyProfit, forward:false}
    debug('estimation',estimation)

    await Promise.all([eDelay(e1), eDelay(e2)]) //TODO Optimize - move after deal
    return estimation
}

function estimateProfit(eBuy, eSell) {
    const buyPrice = findOrderPriceLimit(eBuy._ob.asks, c.budget)
    assert(!(buyPrice===Infinity), 'buyPrice is Infinity (not enough bids for budget)')

    const sellPrice = findOrderPriceLimit(eSell._ob.bids, c.budget)
    assert(!(sellPrice===Infinity), 'sellPrice is Infinity (not enough bids for budget)')

    return sellPrice / buyPrice * 100 - 100

}

function findOrderPriceLimit( lots, amount ) {
    let price = Infinity
    let spend = 0
    let purchased = 0
    for (let i=0; amount>0 && i<lots.length; i++) {
        let lotPrice = lots[i][0]
        let lotAmount = lots[i][1]
        if (lotAmount<amount) {
            amount -= lotAmount
            purchased += lotAmount
            spend += lotPrice * lotAmount
        } else {
            purchased += amount
            spend += lotPrice * amount
            amount = 0
        }
        price = spend / purchased
    }
    if (amount>0) price = Infinity
    return price
}

async function fetchOrderBook(e) {
    e._ob = await e.fetchL2OrderBook(c.pair)
}

async function make(estimation) {
    debug(`make`, estimation )

    // (TRADE -> WAIT -> TRANSFER -> WAIT)
    const traded = await trade(estimation)
    const received = await transfer(traded)
    review(received)
}

async function trade(estimation) {
    let traded = {}
    return traded
}

async function transfer(traded) {
    let received = {}
    return received
}

// review completed deal and save to db
function review(estimation, traded, received) {
    debug('review')
    debug('estimation', estimation)
    debug('traded', traded)
    debug('received', received)

}


let working = true;

(async () => {
    await init()
    let updateInterval = 0
    do {
        await watch()
        if (++updateInterval % 24 ) await update()
    } while (working)

})()