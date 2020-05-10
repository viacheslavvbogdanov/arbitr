const assert = require('assert')
const ccxt = require('ccxt')
// const _      = require('underscore')
/** @member {Object} */
const chalk = require('chalk');
const LocalStorage = require('node-localstorage').LocalStorage
const localStorage = new LocalStorage('./storage')


const DEBUG = true
const log = require('ololog').configure({locate: true})
const err = log;
const debug = DEBUG ? log : function () {};

const delay = ms => new Promise(res => setTimeout(res, ms))

/** @member {Function} */
const Trader = require('./trader.js')

const ExchangeWithDelay = function(name) {
    const e = new ccxt[name]()
    e.$ = {}
    e.$.delay = async function() {
        debug(chalk.gray(`delay ${e.rateLimit}ms`))
        await delay(e.rateLimit)
    }
    return e
}

let config = {
    e1: ExchangeWithDelay('livecoin'),
    e2: ExchangeWithDelay('hitbtc'),
    base: 'CBC',
    quote: 'BTC',
    budget: 0.001, // in quote currency
    minProfit: 10, // in percents
}

let interfaces = {
    log: log,
    err: err,
    debug: debug,
    assert: assert,
    delay: delay,
    localStorage: localStorage
}


let trading = true
async function main() {
    const trader = new Trader(config, interfaces)
    await trader.init()

    do {
        await trader.process()
    } while (trading)

}
main().then()