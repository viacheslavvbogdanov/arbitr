/*
 * Copyright (c) 2020. Viacheslav V Bogdanov
 * viacheslav.v.bogdanov@gmail.com
 */

"use strict"
const assert = require('assert')
const ccxt   = require('ccxt')
// const _      = require('underscore')
const log    = require ('ololog').configure ({ locate: true })
require ('ansicolor').nice
const LocalStorage = require('node-localstorage').LocalStorage
const localStorage = new LocalStorage('./storage')

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
    // check market
    assert(e.markets,                   `Markets is not loaded (${e.name})`)
    assert(e.markets[c.pair],           `Market is not found ${c.pair} (${e.name})`)
    assert(e.markets[c.pair].active,    `Market is not active ${c.pair} (${e.name})`)
    // base currency active
    assert(e.currencies,                `Currencies is not loaded (${e.name})`)
    assert(e.currencies[c.base],        `Currency is not found ${c.base} (${e.name})`)
    assert(e.currencies[c.base].active, `Currency is not active ${c.base} (${e.name})`)
    // quote currency active
    assert(e.currencies[c.quote],        `Currency is not found ${c.quote} (${e.name})`)
    assert(e.currencies[c.quote].active, `Currency is not active ${c.quote} (${e.name})`)
    // TODO top-up of currency active
    // TODD withdrawal of currency active
    // top-up active
    // withdrawal active
}

async function check() {
    await Promise.all([eCheck(e1), eCheck(e2)])
}

async function watch() {
    // WATCH (CHECK, ESTIMATE, MAKE (TRADE -> WAIT -> TRANSFER -> WAIT)
    try {
        // check exchanges and currencies
        await check()
        await estimate()
        if (d.estimatedProfit>=c.minProfit) {
            log('[GOOD DEAL!] Estimated profit:'.green, d.estimatedProfit)
            await make()
        }

    } catch(e) {
        log('[CHECK]'.red, e.message)
        debug(e)
    }
}

let d = {} // main deal object

async function estimate() {
    await Promise.all([fetchOrderBook(e1), fetchOrderBook(e2)])

    let buySellProfit = estimateProfit(e1,e2)
    let sellBuyProfit = estimateProfit(e2,e1)

    d.forward = buySellProfit>sellBuyProfit
    d.estimatedProfit =  d.forward ? buySellProfit : sellBuyProfit
    debug('deal estimation', d)

    await Promise.all([eDelay(e1), eDelay(e2)]) //TODO Optimize - move after trade
}

function estimateProfit(eBuy, eSell) {
    const buyPrice = findOrderPriceLimit(eBuy._ob.asks, c.budget)
    assert(!(buyPrice===Infinity), 'buyPrice is Infinity (not enough asks for budget)')

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

async function make() {
    debug(`make` )
    // (TRADE -> WAIT -> TRANSFER -> WAIT)
    await trade()
    await transfer()
 }

async function trade() {
    debug(`trade` )
    await delay(2000)
}

async function transfer() {
    debug(`transfer` )
    await delay(1000)

    setStatus(_waitingForTransfer)
}

async function waitForTransfer() {
    debug(`waitForTransfer delay 10 sec` )

    await delay(10000)
    review()
    d = {} // clear main deal object
    setStatus(_watching)
}

// review completed deal and save to db
function review() {
    debug('review deal', d)

}

const _watching = 'watching'
const _waitingForTransfer = 'waitingForTransfer'
const _stopping = 'stopping'
const _status = 'status'

function setStatus(status) {
    localStorage.setItem(_status, status)
}

function getStatus() {
    const s =  localStorage.getItem(_status)
    return s ? s : _watching
}

(async () => {
    await init()
    let updateInterval = 0
    do {
        const status = getStatus()
        debug('status',status)
        switch (status)
        {
            case _watching:           await watch(); break
            case _waitingForTransfer: await waitForTransfer(); break
            default: log('[UNKNOWN STATUS]'.red); setStatus(_watching)
        }

        if (!(++updateInterval % 24)) await update()
    } while (getStatus()!==_stopping)

})()