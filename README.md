# Tsy`s RPC for nodejs and brower SDK
Support both JSON AND Buffer
## how to use it
install this package
```shell
npm i @ctsy/rpc
```
import this package
```typescript
import RPC from '@ctsy/rpc'
let rpc = new RPC();
let buffer = rpc.encode();

//or
let rpc = RPC.decode(buffer)
```