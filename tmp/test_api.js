const http = require('http');

const data = JSON.stringify({
    toDistrictId: 1482,
    toWardCode: "1B0813",
    weight: 500
});

const options = {
    hostname: 'localhost',
    port: 8080,
    path: '/api/shipping/ghn/calculate-fee',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
        console.log(`BODY: ${chunk}`);
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
