/*
 * Copyright © 2020. Viacheslav V Bogdanov
 * viacheslav.v.bogdanov@gmail.com
 */

"use strict";

module.exports = function (config) {

    let cfg = null
    let deal = {} // main deal object

    // construct
    if (!config) throw new Error('Please provide config')
    cfg = config
    cfg.pair = cfg.base + '/' + cfg.quote

    const log = cfg.log
    const err = cfg.err
    const debug = cfg.debug
    const e1 = cfg.e1
    const e2 = cfg.e2
    const localStorage = cfg.localStorage
    const assert = cfg.assert
    const delay = cfg.delay

    debug('[constructor] config:', cfg)

    async function update() {
        try {
            await Promise.all([eUpdate(e1), eUpdate(e2)])
        } catch (e) {
            err('[UPDATE]', e.message)
            debug(e)
        }
    }

    async function eUpdate(e) {
        debug(`eUpdate ${e.name}`)
        await e.loadMarkets(true)
        // debug('market', e.markets[cfg.pair] )
        await e.$.delay()
        await e.fetchCurrencies()
        await e.$.delay()
        // await e.fetchBalance()
        // await e.$.delay()
    }

    async function eCheck(e) {
        debug(`eCheck ${e.name}`)
        // TODO check it all
        // check market orders
        assert(e.has['createMarketOrder'], `Exchange have no market orders (${e.name})`)
        // check market
        assert(e.markets, `Markets is not loaded (${e.name})`)
        assert(e.markets[cfg.pair], `Market is not found ${cfg.pair} (${e.name})`)
        assert(e.markets[cfg.pair].active, `Market is not active ${cfg.pair} (${e.name})`)
        // base currency active
        assert(e.currencies, `Currencies is not loaded (${e.name})`)
        assert(e.currencies[cfg.base], `Currency is not found ${cfg.base} (${e.name})`)
        assert(e.currencies[cfg.base].active, `Currency is not active ${cfg.base} (${e.name})`)
        // quote currency active
        assert(e.currencies[cfg.quote], `Currency is not found ${cfg.quote} (${e.name})`)
        assert(e.currencies[cfg.quote].active, `Currency is not active ${cfg.quote} (${e.name})`)
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
            if (deal.estimatedProfit >= cfg.minProfit) {
                log('[GOOD DEAL!] Estimated profit:', deal.estimatedProfit)
                await make()
            }

        } catch (ex) {
            err('[CHECK]', ex.message)
            debug(ex)
            log('Waiting 10 sec after failure...')
            await delay(10000)
            await update() // update exchanges after delay
        }
    }


    async function estimate() {
        await Promise.all([fetchOrderBook(e1), fetchOrderBook(e2)])

        let buySellProfit = estimateProfit(e1, e2)
        let sellBuyProfit = estimateProfit(e2, e1)

        deal.forward = buySellProfit > sellBuyProfit
        deal.estimatedProfit = deal.forward ? buySellProfit : sellBuyProfit
        debug('deal estimation', deal)

        await Promise.all([e1.$.delay(), e2.$.delay()]) //TODO Optimize - move after trade
    }

    function estimateProfit(eBuy, eSell)
    {
        const buyPrice = findOrderPriceLimit(eBuy.$.orderBook.asks, cfg.budget)
        assert(!(buyPrice === Infinity), 'buyPrice is Infinity (not enough asks for budget)')

        const sellPrice = findOrderPriceLimit(eSell.$.orderBook.bids, cfg.budget)
        assert(!(sellPrice === Infinity), 'sellPrice is Infinity (not enough bids for budget)')

        return sellPrice / buyPrice * 100 - 100
    }

    function findOrderPriceLimit(lots, amount) {
        let price = Infinity
        let spend = 0
        let purchased = 0
        for (let i = 0; amount > 0 && i < lots.length; i++) {
            let lotPrice = lots[i][0]
            let lotAmount = lots[i][1]
            if (lotAmount < amount) {
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
        if (amount > 0) price = Infinity
        return price
    }

    async function fetchOrderBook(e) {
        e.$.orderBook = await e.fetchL2OrderBook(cfg.pair)
    }

    async function make() {
        debug(`make`)
        // (CHECK TRADE -> TRADE -> WAIT -> TRANSFER -> WAIT)
        await checkTrade()
        await trade()
        await transfer()
    }

    async function checkTrade() {
        debug(`checkTrade`)
        //TODO Check trade
        //market limits.amount.min

    }

    async function trade() {
        debug(`trade`)
        await delay(2000)
    }

    async function transfer() {
        debug(`transfer`)
        await delay(1000)

        setStatus(_waitingForTransfer)
    }

    async function waitForTransfer() {
        debug(`waitForTransfer delay 10 sec`)

        await delay(10000)
        review()
        deal = {} // clear main deal object
        setStatus(_watching)
    }

// review completed deal and save to db
    function review() {
        debug('review deal', deal)

    }

    const _watching = 'watching'
    const _waitingForTransfer = 'waitingForTransfer'
    const _status = 'status'

    function setStatus(status) {
        localStorage.setItem(_status, status)
    }

    function getStatus() {
        const s = localStorage.getItem(_status)
        return s ? s : _watching
    }

    let updateInterval = 0

    // public
    return {
        init: async function () {
            await update()
        },
        process : async function () {
            const status = getStatus()
            debug('process status', status)
            // update every 24 steps
            if (!(++updateInterval % 24)) await update()
            switch (status) {
                case _watching:
                    await watch();
                    break
                case _waitingForTransfer:
                    await waitForTransfer();
                    break
                default:
                    err('[UNKNOWN STATUS]');
                    setStatus(_watching)
            }
        }
    }
}
