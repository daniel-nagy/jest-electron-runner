/**
 * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

// $FlowFixMe flow doesn't know about console
import {Console} from 'console';
delete global.console;
global.console = new Console(process.stdout, process.stderr);
// $FlowFixMe
import {app, BrowserWindow, ipcMain} from 'electron';

import type {IPCWorker} from '../ipc-client';
import type {MessageType} from '../utils';

import {connectToIPCServer} from '../ipc-client';
import {
  getIPCIDs,
  MESSAGE_TYPES,
  parseMessage,
  parseJSON,
  makeMessage,
  buildFailureTestResult,
} from '../utils';
import os from 'os';
import runTest from 'jest-runner/build/run_test';
import Runtime from 'jest-runtime';
import HasteMap from 'jest-haste-map';

const appReady = new Promise(r => app.on('ready', r));

const _runTest = (
  testData,
  // testData.path,
  // testData.globalConfig,
  // testData.config,
  // testData.rawModuleMap,
  // getResolver(testData.config, testData.rawModuleMap),
) => {
  return new Promise(resolve => {
    const win = new BrowserWindow({show: false});
    win.loadURL(`file://${require.resolve('./index.html')}`);
    win.webContents.on('did-finish-load', () => {
      win.webContents.send('run-test', testData);
    });

    ipcMain.on('testfinished', (event, data) => {
      resolve(data);
    });
  });
};

const start = async () => {
  await appReady;
  return new Promise(async resolve => {
    const {serverID, workerID} = getIPCIDs();
    const connection: IPCWorker = await connectToIPCServer({
      serverID,
      workerID,
    });

    connection.onMessage(message => {
      try {
        const {messageType, data} = parseMessage(message);

        switch (messageType) {
          case MESSAGE_TYPES.RUN_TEST: {
            const testData = parseJSON(data);
            _runTest(testData)
              .catch(error => {
                const testResult = buildFailureTestResult(
                  testData.path,
                  error,
                  testData.config,
                  testData.globalConfig,
                );
                return testResult;
              })
              .then(result => {
                const msg = makeMessage({
                  messageType: MESSAGE_TYPES.TEST_RESULT,
                  data: JSON.stringify(result),
                });
                connection.send(msg);
              });
            break;
          }
          case MESSAGE_TYPES.SHUT_DOWN: {
            resolve();
            connection.disconnect();
            // process.exit(0);
            break;
          }
        }
      } catch (e) {
        console.error(e);
      }
    });
  });
};

start()
  .then(() => {
    // process.exit(0);
  })
  .catch(e => {
    console.error(e);
    // process.exit(1);
  });
