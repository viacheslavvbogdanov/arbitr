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

const defaultConfig = {
    e1name: 'hitbtc',
    e2name: 'livecoin',
    base:   'XAUR',
    quote:  'BTC',
    budget: 0.00011 // in quote currency
}

// const PROXY = ''
let c = null // configuration
let e1, e2 //exchanges objects

async function init(config=defaultConfig) {
    c = config
    e1 = new ccxt[c.e1name] ()
    e2 = new ccxt[c.e2name] ()
    await update()
}

async function update() {
    await Promise.all([eUpdate(e1), eUpdate(e2)] )
}

async function eDelay(e) {
    debug(`delay ${e.rateLimit}ms` )
    await delay(e.rateLimit)
}

async function eUpdate(e) {
    debug(`eUpdate ${e.name}` )
    e.markets = await e.loadMarkets()
    await eDelay(e)
    e.currencies = await e.fetchCurrencies()
    await eDelay(e)
}

async function eCheck(e) {
    debug(`eCheck ${e.name}` )
    // TODO check
    // exchange active
    // top-up active
    // withdrawal active
    // base currency active
    // quote currency active
}

async function check() {


}


let working = true;

(async () => {
    await init(config)
    let updateInterval = 0

    do {
        if (++updateInterval % 24 ) await update()
        await check()
    } while (working)
})()