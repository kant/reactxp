/**
* Network.ts
*
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT license.
*
* Native implementation of network information APIs.
*/

import RN = require('react-native');
import SyncTasks = require('synctasks');

import RX = require('../common/Interfaces');
import Types = require('../common/Types');

export class Network extends RX.Network {
    constructor() {
        super();

        let onEventOccuredHandler = this._onEventOccured.bind(this);

        RN.NetInfo.isConnected.addEventListener('change', onEventOccuredHandler);
    }

    isConnected(): SyncTasks.Promise<boolean> {
        let deferred = SyncTasks.Defer<boolean>();

        RN.NetInfo.isConnected.fetch().then(isConnected => {
            deferred.resolve(isConnected);
        }).catch(() => {
            deferred.reject('RN.NetInfo.isConnected.fetch() failed');
        });

        return deferred.promise();
    }

    getType(): SyncTasks.Promise<Types.DeviceNetworkType> {
        return SyncTasks.fromThenable(RN.NetInfo.getConnectionInfo()).then(info => {
            return Network._getNetworkType(info);
        });
    }

    private _onEventOccured(isConnected: boolean) {
        this.connectivityChangedEvent.fire(isConnected);
    }

    private static _getNetworkType(info: RN.ConnectionInfo): Types.DeviceNetworkType {
        if (info.effectiveType === '2g') {
            return Types.DeviceNetworkType.Mobile2G;
        } else if (info.effectiveType === '3g') {
            return Types.DeviceNetworkType.Mobile3G;
        } else if (info.effectiveType === '4g') {
            return Types.DeviceNetworkType.Mobile4G;
        } else if (info.type === 'wifi' || info.type === 'ethernet') {
            return Types.DeviceNetworkType.Wifi;
        } else if (info.type === 'none') {
            return Types.DeviceNetworkType.None;
        }

        return Types.DeviceNetworkType.Unknown;
    }
}

export default new Network();
