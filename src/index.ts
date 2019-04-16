import { RPC, RPCType, checkTopic } from '@ctsy/rpc';
import { Buffer } from 'buffer'
import { EventEmitter } from 'eventemitter3';
import * as debug from 'debug'
const dlog = debug('RPCClient')

export enum ClientEvent {
    LOGINED = 'LOGINED',
    LINK_ERROR = 'LINK_ERROR',
    LINK_OPEND = 'LINK_OPENED',
    LINK_CLOSED = 'LINK_CLOSED',
    PUSH = 'PUSH',
    PUBLISH_RECEIVE = 'PUBLISH_RECEIVE',
    SERVICE_REQUEST = 'SERVICE_REQUEST',
    MESSAGE = 'MESSAGE',
    MOVE = 'MOVE',
    UNKNOW_RESPONSE = 'UNKNOW_RESPONSE',
    UNKNOW_TYPE = 'UNKNOW_TYPE'
}
export interface RequestOption {
    NeedReply?: Boolean,
    Timeout?: number,
    Type?: RPCType
}
export enum ClientError {
    Timeout = 'Timeout',
    MaxRequest = 'MaxRequest',
    NotSupport = 'NotSupport',
    NotFound = 'NotFound'
}
export enum MessageType {
    JSON,
    Binary
}
export default abstract class Client extends EventEmitter {
    /**
     * 本地地址
     */
    protected Addr: string = "";
    private logined: boolean = false;
    /**
     * 是否登录
     */
    protected get _logined() {
        return this.logined;
    }
    protected set _logined(v: boolean) {
        this.logined = v;
        if (v) {
            if (this._waiting.length > 0) {
                this._waiting.forEach((v) => {
                    this.send(v);
                })
            }
        }
    }
    /**
     * 请求编号
     */
    protected _id: number = 0;
    /**
     * 请求的promise对象
     */
    protected _idPromise: { [index: string]: { s: Function, j: Function } } = {}
    /**
     * 已注册方法
     */
    protected _registed: { [index: string]: Function };

    /**
     * RPC待发送列表
     */
    protected _waiting: RPC[] = [];
    constructor(Addr: string) {
        super();
        this.Addr = Addr;
    }
    /**
     * 控制器方法
     * @param rpc 
     * @param sock 
     */
    async controller(rpc: RPC, sock): Promise<any> {
        throw new Error(ClientError.NotFound)
    }
    /**
     * 发送方法
     * @param data 
     */
    async send(data: RPC) {
        throw new Error(ClientError.NotSupport)
    }
    /**
     * 接收到数据
     * @param data 
     * @param sock 
     */
    async onmessage(data: Buffer | string, sock: any) {
        let rpc: RPC;
        if ('string' == typeof data) {
            rpc = JSON.parse(data);
        } else if (Buffer.isBuffer(data)) {
            rpc = RPC.decode(data);
        } else {
            throw new Error('Wrong RPC Data');
        }
        this._id = rpc.ID + 1;
        if (this._id > 65535) { this._id = 0; }
        if (this['hand' + RPCType[rpc.Type]] instanceof Function) {
            try {
                let r = await this['hand' + RPCType[rpc.Type]](rpc, sock);
                if (r != undefined && rpc.NeedReply) {
                    this.send(r);
                }
            } catch (error) {

            }
        } else {
            dlog(ClientEvent.UNKNOW_TYPE + ': %s', rpc.Type)
            this.emit(ClientEvent.UNKNOW_TYPE, { rpc, sock });
        }
    }
    /**
     * 处理请求
     * @param rpc 
     * @param sock 
     */
    async handRequest(rpc: RPC, sock) {
        if (this._registed[rpc.Path] instanceof Function) {
            try {
                rpc.Data = await this._registed[rpc.Path](rpc, sock);
            } catch (error) {
                rpc.Data = error.message;
                rpc.Status = false;
            }
        } else {
            try {
                rpc.Data = await this.controller(rpc, sock);
            } catch (error) {
                rpc.Data = error.message;
                rpc.Status = false;
            }
        }
        rpc.Data = false;
        return rpc;
    }
    /**
     * 
     * @param rpc 
     */
    protected promise(rpc: RPC) {
        if (this._idPromise[rpc.ID]) {
            if (rpc.Status) {
                this._idPromise[rpc.ID].s(rpc.Data);
            } else {
                this._idPromise[rpc.ID].j(rpc.Data);
            }
            delete this._idPromise[rpc.ID];
        }
    }
    /**
     * 处理请求响应
     * @param rpc 
     * @param sock 
     */
    async handResponse(rpc: RPC, sock) {
        this.promise(rpc);
    }
    /**
     * 处理推送
     * @param rpc 
     * @param sock 
     */
    async handPush(rpc: RPC, sock) {
        this.emit(ClientEvent.PUSH, rpc);
        rpc.Status = true;
        rpc.Data = '';
        return rpc;
    }
    /**
     * 切换服务器
     * @param rpc 
     * @param sock 
     */
    async handMove(rpc: RPC, sock) {
        this.emit(ClientEvent.MOVE, rpc);
        rpc.Status = false;
        rpc.Data = '';
        return rpc;
    }
    /**
     * 处理代理转发
     * @param rpc 
     * @param sock 
     */
    async handProxy(rpc: RPC, sock) {
        if (rpc.To == this.Addr) {
            this.onproxy(rpc);
        }
    }
    async onproxy(rpc) {

    }
    async handPing(rpc: RPC, sock) {
        rpc.Type = RPCType.Pong;
        return rpc;
    }
    async handPong(rpc: RPC, sock) {
        // this.emit(ClientEvent)
    }
    async handRegist(rpc: RPC, sock) {
        throw new Error(ClientError.NotSupport)
    }
    /**
     * 处理登陆请求，客户端部分不需要
     * @param rpc 
     * @param sock 
     */
    async handLogin(rpc: RPC, sock) {
        // throw new Error(ClientError.NotSupport)
        this._logined = true;
        // this.emit(ClientEvent.LOGINED, this.Addr);
    }
    async handPub(rpc: RPC, sock) {
        this.emit('_sub' + rpc.Path, { data: rpc.Data, rpc: rpc })
        rpc.Status = true;
        rpc.Data = '';
        return rpc;
    }
    async handSub(rpc: RPC, sock) {
        throw new Error(ClientError.NotSupport)
    }
    async handUnSub(rpc: RPC, sock) {
        throw new Error(ClientError.NotSupport)
    }
    /**
     * 推送消息
     * @param to 
     * @param data 
     */
    async push(to: string, data: any) {
        let rpc = new RPC;
        rpc.ID = this.ID;
        rpc.Path = to;
        rpc.Type = RPCType.Push;
        rpc.Data = data;
        rpc.NeedReply = false;
        this.send(rpc);
    }
    /**
     * 发布订阅
     * @param topic 
     * @param data 
     */
    async publish(topic: string, data: any) {
        let rpc = new RPC;
        rpc.ID = this.ID;
        rpc.Path = topic;
        rpc.Type = RPCType.Pub;
        rpc.Data = data;
        rpc.NeedReply = false;
        this.send(rpc);
        return true;
    }
    /**
     * 订阅
     * @param topic 
     * @param cb 
     */
    async subscribe(topic: string | string[], cb: (data: any, rpc: RPC) => any) {
        this.on('_sub' + topic, cb)
        let rpc = new RPC;
        rpc.ID = this.ID;
        rpc.Data = topic;
        rpc.Type = RPCType.Sub;
        rpc.NeedReply = true;
        this.send(rpc);
        return true;
    }
    /**
     * 取消订阅
     * @param topic 
     */
    async unsubscribe(topic: string, cb) {
        this.off('_sub' + topic, cb);
        //TODO 本地没有其他订阅函数了再发起取消订阅请求
        if (true) {
            let rpc = new RPC;
            rpc.ID = this.ID;
            rpc.Path = topic;
            rpc.Type = RPCType.UnSub;
            rpc.NeedReply = false;
            this.send(rpc);
        }
        return true;
    }
    /**
     * 发起请求
     * @param path 
     * @param data 
     * @param opts 
     */
    request(path: string, data: any, opts: { Timeout?: number, NeedReply?: boolean, Type?: RPCType }): Promise<any> {
        return new Promise((s, j) => {
            let rpc = new RPC;
            rpc.ID = this.ID;
            rpc.Path = path;
            rpc.Data = data;
            rpc.Type = opts.Type || RPCType.Request;
            rpc.NeedReply = opts.NeedReply || true;
            if (opts.Timeout) {
                setTimeout(() => {
                    rpc.Status = false;
                    rpc.Data = ClientError.Timeout;
                    this.promise(rpc)
                }, opts.Timeout * 1000)

                let t = opts.Timeout / 60;
                //默认为毫秒，往上进位
                while (t > 1) {
                    rpc.TimeoutUnit++;
                    opts.Timeout = t;
                    t /= 60;
                }
                rpc.Timeout = opts.Timeout;
            }
            this.send(rpc);
            if (opts.NeedReply) {
                this._idPromise[rpc.ID] = { s, j };
            } else {
                s(true);
            }
        })
    }
    onconnected() {
        this._logined = false;
        this.login();
    }
    async login() {
        let rpc = new RPC()
        rpc.Type = RPCType.Login;
        rpc.From = this.Addr;
        this.send(rpc)
    }
    /**
     * 获取请求ID
     */
    protected get ID() {
        if (this._id == 65535) { this._id = 0; }
        return this._id++;
    }
}
declare let window: any
try {
    if (window) {
        if (!window['ctsy']) {
            window['ctsy'] = {}
        }
        window['ctsy']['RPCClient'] = Client;
    }
} catch (error) {

}