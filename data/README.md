# Runtime data

`db.json` is the live application database and contains private member/account/financial data. Do not commit it to source control or serve it as a public asset.

For Git-based deployments, provision persistent storage and copy the private `db.json` backup into that storage before sending production traffic to the application.
