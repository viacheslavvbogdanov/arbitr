/*
 * Copyright © 2020. Viacheslav V Bogdanov
 * viacheslav.v.bogdanov@gmail.com
 * 
 *
 */

"use strict";

const allDepositAddresses = {}

/**
 * Wraps initialized ccxt exchange with simulated trading methods
 *
 * @param e initialized ccxt exchange
 * @param balances object of all balances
 * @param interfaces to external functions
 */
module.exports = function (e, balances, interfaces) {
    const assert = interfaces.assert

    if (!allDepositAddresses[e.name]) {
        allDepositAddresses[e.name] = {}
    }
    const depositAddresses = allDepositAddresses[e.name]

    if (!balances[e.name]) {
        balances[e.name] = {'info': {simulated:true,arguments:arguments}, 'free': {}, 'used': {}, 'total': {}}
    }
    const balance = balances[e.name]

    // const _fetchBalance = e.fetchBalance
    // const _createOrder = e.createOrder
    // const _fetchOrder = e.fetchOrder
    // const _fetchOrders = e.fetchOrders
    // const _fetchOpenOrders = e.fetchOpenOrders
    // const _fetchClosedOrders = e.fetchClosedOrders
    // const _fetchMyTrades = e.fetchMyTrades
    // const _fetchDepositAddress  = e.fetchDepositAddress
    // const _createDepositAddress   = e.createDepositAddress
    // const _withdraw = e.withdraw

    function setBalance(currency, value) {
        // simulate balance structure
        // https://github.com/ccxt/ccxt/wiki/Manual#balance-structure
        balance[currency] = {free:value,used:0,total:value}
        balance.free[currency] = value
        balance.used[currency] = 0
        balance.total[currency] = value
    }
    e.$setSimulatedBalance = setBalance

    function simulateDepositToAddress(currencyCode, address, tag, value) {
        assert( allDepositAddresses[address], `[simulateDepositToAddress] ${address} and (${tag}) is not found!`)

        const eName = allDepositAddresses[address][tag]
        const b = balances[eName]
        const prev = b.free[currencyCode] || 0
        b[currencyCode] = {free:value+prev,used:0,total:value+prev}
        b.free[currencyCode] = value+prev
        b.used[currencyCode] = 0
        b.total[currencyCode] = value+prev
    }

    function getBalance(currency) {
        return balance[currency] ? balance[currency].total : 0
    }

    e.fetchBalance = async function() {
        return balance
    }

    e.createDepositAddress = async function(currencyCode) {
        const tag = 'SIMULATED-TAG'
        const address = {
            'currency': currencyCode, // currency code
            'address': '0x-'+e.name+'-'+currencyCode,   // address in terms of requested currency
            'tag': tag,           // tag / memo / paymentId for particular currencies (XRP, XMR, ...)
            'info': {simulated:true,arguments:arguments},     // raw data as returned from the exchange
        }
        depositAddresses[currencyCode] = address
        if (!balance[currencyCode]) setBalance(currencyCode, 0)
        const addressRef = address.address
        allDepositAddresses[addressRef] = {}
        allDepositAddresses[addressRef][tag] = e.name

        return address
    }

    e.fetchDepositAddress = async function(currencyCode) {
        const address = depositAddresses[currencyCode]
        return address ? address : await e.createDepositAddress(currencyCode)
    }

    e.withdraw = async function(currencyCode, amount, address, tag = undefined, params = {}) {
        const b = getBalance(currencyCode)
        assert( b>=amount, `[${e.name}] ${currencyCode} balance (${b}) less than withdrawal amount (${amount})`)
        setBalance(currencyCode, b-amount)
        simulateDepositToAddress(currencyCode, address, tag, amount)
        // TODO deduct withdrawal fee

        return {info:{simulated:true,arguments:arguments}, id:'SIMULATED-ID'}
    }

    e.createOrder = async function(symbol, type, side, amount, price=undefined) {
        assert(type==='market', 'Just market orders simulation supported')
        assert(side==='buy' || side==='sell', 'Only buy and sell orders supported')
        const parts = symbol.split('/')
        const base = parts[0]
        const quote = parts[1]
        const cost = amount*price
        const baseBalance = getBalance(base)
        const quoteBalance = getBalance(quote)
        if (side==='buy') {
            assert(quoteBalance >= cost, `Quote balance (${quoteBalance} must be >= cost (${cost})`)
            setBalance(quote, quoteBalance - cost)
            setBalance(base, baseBalance + amount)
        } else if (side==='sell') {
            assert(baseBalance >= amount, `Base balance (${baseBalance} must be >= amount (${amount})`)
            setBalance(base, baseBalance - amount)
            setBalance(quote, quoteBalance + cost)
        } else throw new Error('Only buy and sell orders supported')

        //TODO deduct transaction fee

        return {info:{simulated:true,arguments:arguments}, id:'SIMULATED-ORDER-ID'}
    }

    e.$simulation = true
    // e.__defineGetter__('$simulation', () => true)
    // e.__defineSetter__('$simulation', (simulate) => simulation = simulate )

    return e
}