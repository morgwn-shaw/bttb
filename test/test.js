"use strict";

/*  ------------------------------------------------------------------------ */

const exchangeId = process.env.EXCHANGE
const verbose = process.argv.includes ('--verbose') || false

/*  ------------------------------------------------------------------------ */

const asTable   = require ('as-table')
    , util      = require ('util')
    , log       = require ('ololog')
    , ansi      = require ('ansicolor').nice
    , fs        = require ('fs')
    , ccxt      = require ('../ccxt')
    , countries = require ('../countries')
    , chai      = require ('chai')
    , expect    = chai.expect
    , assert    = chai.assert

/*  ------------------------------------------------------------------------ */

const warn = log.bright.yellow.error // .error goes to stderr

//-----------------------------------------------------------------------------

var countryName = function (code) {
    return ((typeof countries[code] !== 'undefined') ? countries[code] : code)
}

//-----------------------------------------------------------------------------

let human_value = function (price) {
    return typeof price == 'undefined' ? 'N/A' : price
}

//-----------------------------------------------------------------------------

let testTicker = async (exchange, symbol) => {

    if (exchange.hasFetchTicker) {

        log (symbol.green, 'fetching ticker...')

        let ticker = await exchange.fetchTicker (symbol)
        const keys = [ 'datetime', 'timestamp', 'high', 'low', 'bid', 'ask', 'quoteVolume' ]

        keys.forEach (key => assert (key in ticker))

        log (symbol.green, 'ticker',
            ticker['datetime'],
            ... (keys.map (key =>
                key + ': ' + human_value (ticker[key]))))

        if (exchange.id != 'coinmarketcap')
            assert (ticker['bid'] <= ticker['ask'])



    } else {

        log (symbol.green, 'fetchTicker () not supported')
    }
}

//-----------------------------------------------------------------------------

let testOrderBook = async (exchange, symbol) => {

    log (symbol.green, 'fetching order book...')

    let orderbook = await exchange.fetchOrderBook (symbol)

    const format = {
        'bids': [],
        'asks': [],
        'timestamp': 1234567890,
        'datetime': '2017-09-01T00:00:00',
    };

    expect (orderbook).to.have.all.keys (format)

    log (symbol.green,
        orderbook['datetime'],
        'bid: '       + ((orderbook.bids.length > 0) ? human_value (orderbook.bids[0][0]) : 'N/A'),
        'bidVolume: ' + ((orderbook.bids.length > 0) ? human_value (orderbook.bids[0][1]) : 'N/A'),
        'ask: '       + ((orderbook.asks.length > 0) ? human_value (orderbook.asks[0][0]) : 'N/A'),
        'askVolume: ' + ((orderbook.asks.length > 0) ? human_value (orderbook.asks[0][1]) : 'N/A'))

    const bids = orderbook.bids
    const asks = orderbook.asks

    if (bids.length > 1)
        assert (bids[0][0] >= bids[bids.length - 1][0])

    if (asks.length > 1)
        assert (asks[0][0] <= asks[asks.length - 1][0])

    if (bids.length && asks.length)
        assert (bids[0][0] <= asks[0][0])

    return orderbook
}

//-----------------------------------------------------------------------------

let testTrades = async (exchange, symbol) => {

    if (exchange.hasFetchTrades) {

        log (symbol.green, 'fetching trades...')

        let trades = await exchange.fetchTrades (symbol)

        log (symbol.green, 'fetched', Object.values (trades).length.toString ().green, 'trades')

    } else {

        log (symbol.green, 'fetchTrades () not supported'.yellow);
    }
}

//-----------------------------------------------------------------------------

let testTickers = async (exchange) => {

    if (exchange.hasFetchTickers) {

        log ('fetching all tickers at once...')
        let tickers = await exchange.fetchTickers ()
        log ('fetched', Object.keys (tickers).length.toString ().green, 'tickers')

    } else {

        log ('fetching all tickers at once not supported')
    }
}

//-----------------------------------------------------------------------------

let testOHLCV = async (exchange, symbol) => {

    if (exchange.hasFetchOHLCV) {

        log (symbol.green, 'fetching OHLCV...')
        let ohlcv = await exchange.fetchOHLCV (symbol)
        log (symbol.green, 'fetched', Object.keys (ohlcv).length.toString ().green, 'OHLCVs')

    } else {

        log ('fetching OHLCV not supported')
    }
}

//-----------------------------------------------------------------------------

let testSymbol = async (exchange, symbol) => {

    await testTicker (exchange, symbol)
    await testTickers (exchange)
    await testOHLCV (exchange, symbol)
    await testTrades (exchange, symbol)

    if (exchange.id == 'coinmarketcap') {

        log (await exchange.fetchTickers ())
        log (await exchange.fetchGlobal ())

    } else {

        await testOrderBook (exchange, symbol)

    }
}

//-----------------------------------------------------------------------------

let testOrders = async (exchange, symbol) => {

    if (exchange.hasFetchOrders) {

        log ('fetching orders...')
        let orders = await exchange.fetchOrders (symbol)
        log ('fetched', orders.length.toString ().green, 'orders')
        log (asTable (orders))

    } else {

        log ('fetching orders not supported')
    }
}

//-----------------------------------------------------------------------------

let testMyTrades = async (exchange, symbol) => {

    if (exchange.hasFetchMyTrades) {

        log ('fetching my trades...')
        let trades = await exchange.fetchMyTrades (symbol)
        log ('fetched', trades.length.toString ().green, 'trades')
        log (asTable (trades))

    } else {

        log ('fetching trades not supported')
    }
}

//-----------------------------------------------------------------------------



//-----------------------------------------------------------------------------

describe (exchangeId, function () {

    const keysGlobal = '../keys.json'
        , keysLocal  = '../keys.local.json'
        , keysFile   = fs.existsSync (keysLocal) ? keysLocal : keysGlobal
        , settings   = require (keysFile)[exchangeId]

    if (settings && settings.skip) {

        warn ('SKIPPED')

    } else if (!settings.apiKey || (settings.apiKey.length < 1)) {

        warn ('NO API KEY')

    } else {

        const allowedSymbols = new Set ([

                'BTC/USD',
                'BTC/CNY',
                'BTC/EUR',
                'BTC/ETH',
                'ETH/BTC',
                'BTC/JPY',
                'LTC/BTC'
            ])
            , proxies = [

                '',
                'https://cors-anywhere.herokuapp.com/',
                'https://crossorigin.me/',
            ]

        let exchange = new (ccxt)[exchangeId] ({ ...settings, verbose, enableRateLimit: true }),
            symbols

        // move to testnet/sandbox if possible before accessing the balance if possible
        if (exchange.urls['test'])
            exchange.urls['api'] = exchange.urls['test'];
    
        const tryAllProxies = fn => async () => { // TODO: move it to the ccxt itself

            let currentProxy = 0
            let maxRetries   = proxies.length
        
            for (let numRetries = 0; numRetries < maxRetries; numRetries++) {
        
                try {
        
                    exchange.proxy = proxies[currentProxy]
                    return await fn ()
        
                } catch (e) {
        
                    currentProxy = ++currentProxy % proxies.length
                    if (e instanceof ccxt.DDoSProtection) {
                        warn ('[DDoS Protection] ' + e.message)
                    } else if (e instanceof ccxt.RequestTimeout) {
                        warn ('[Request Timeout] ' + e.message)
                    } else if (e instanceof ccxt.AuthenticationError) {
                        warn ('[Authentication Error] ' + e.message)
                    } else if (e instanceof ccxt.ExchangeNotAvailable) {
                        warn ('[Exchange Not Available] ' + e.message)
                    } else if (e instanceof ccxt.NotSupported) {
                        warn ('[Not Supported] ' + e.message)
                    } else if (e instanceof ccxt.ExchangeError) {
                        warn ('[Exchange Error] ' + e.message)
                    } else {
                        throw e;
                    }
                }
            }
        }
        
        const loadSymbols = async function () {

            await exchange.loadMarkets ()
            const result = exchange.symbols.filter (s => (s.indexOf ('.d') < 0) && allowedSymbols.has (s))
            return result.length ? result : [exchange.symbols[0]]
        }

        this.verbose = true

        it ('loads markets', tryAllProxies (async () => {

            const markets = await exchange.loadMarkets ()

            // TODO: assert(markets, { ... })
        }))

        it ('exposes symbols', tryAllProxies (async () => {

            const symbols = await loadSymbols ()

            expect (symbols.length > 0)
            
            log ('SYMBOLS:'.bright, await loadSymbols ())
        }))

        it ('fetches balance', tryAllProxies (async () => {
        
            let balance = await exchange.fetchBalance ()
            let currencies = [ 'USD', 'CNY', 'EUR', 'BTC', 'ETH', 'JPY', 'LTC', 'DASH', 'DOGE', 'UAH', 'RUB' ]
        
            if ('info' in balance) {
        
                let result = currencies
                    .filter (currency => (currency in balance) &&
                        (typeof balance[currency]['total'] != 'undefined'))
        
                if (result.length > 0) {
                    result = result.map (currency => currency + ': ' + human_value (balance[currency]['total']))
                    if (exchange.currencies.length > result.length)
                        result = result.join (', ') + ' + more...'
                    else
                        result = result.join (', ')
        
                } else {
        
                    result = 'zero balance'
                }
        
                log (result)
        
            } else {
        
                log (exchange.omit (balance, 'info'))
            }
        }))
    
        // await testBalance  (exchange)
        // await testOrders   (exchange, symbol)
        // await testMyTrades (exchange, symbol)
    }
})
