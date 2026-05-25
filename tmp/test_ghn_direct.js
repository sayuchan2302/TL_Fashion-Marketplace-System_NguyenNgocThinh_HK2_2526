const https = require('https');

const data = JSON.stringify({
    from_district_id: 1450,
    to_district_id: 1482,
    to_ward_code: "1B0813",
    service_type_id: 2,
    weight: 500,
    height: 10,
    length: 10,
    width: 10,
    insurance_value: 0
});

const options = {
    hostname: 'online-gateway.ghn.vn',
    path: '/shiip/public-api/v2/shipping-order/fee',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Token': 'a5458d65-5829-11f1-86c8-fa24cb838bce',
        'Content-Length': data.length
    }
};

const req = https.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.setEncoding('utf8');
    let body = '';
    res.on('data', (chunk) => {
        body += chunk;
    });
    res.on('end', () => {
        console.log(`BODY: ${body}`);
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
