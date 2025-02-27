import * as vscode from 'vscode';
import { BevyRemoteProtocol, ServerVersion } from 'bevy-remote-protocol';
import { Client } from './client';
import { ClientElement } from './hierarchy';

type AddBehavior = 'prompt' | 'last';

export class ClientCollection {
  // Properties
  private collection = new Map<string, Client>();
  private lastProtocol: null | BevyRemoteProtocol = null;

  // Events
  private clientAddedEmitter = new vscode.EventEmitter<Client>();
  readonly onClientAdded = this.clientAddedEmitter.event;
  private clientRemovedEmitter = new vscode.EventEmitter<Client>();
  readonly onClientRemoved = this.clientRemovedEmitter.event;

  public async tryCreateClient(behavior: AddBehavior = 'prompt') {
    let newClient;

    if (this.lastProtocol instanceof BevyRemoteProtocol && behavior === 'last') {
      newClient = new Client(this.lastProtocol.url, this.lastProtocol.serverVersion);
    } else {
      // Input URL
      const url = await vscode.window.showInputBox({
        title: 'Connection to Bevy Instance',
        value: BevyRemoteProtocol.DEFAULT_URL.toString(),
      });
      if (!url) {
        return;
      }

      // Input version
      const versions = Object.keys(ServerVersion);
      const versionString = await vscode.window.showQuickPick(versions, { canPickMany: false });
      if (!versionString) {
        return;
      }
      const versionEnum = Object.values(ServerVersion)[Object.keys(ServerVersion).indexOf(versionString)];

      // Create new session
      newClient = new Client(new URL(url), versionEnum);
    }

    // if such alive client already exists
    const existingClient = this.collection.get(newClient.getProtocol().url.host);
    if (existingClient && existingClient.getState() === 'alive') {
      vscode.window.showInformationMessage('Specified connection already exists');
      return;
    }

    newClient.initialize().then((status) => {
      if (status !== 'success') {
        return;
      }

      // Success
      this.lastProtocol = newClient.cloneProtocol();
      this.collection.set(this.lastProtocol.url.host, newClient);

      // Events
      this.clientAddedEmitter.fire(newClient);
    });
  }

  public removeClient(host: string) {
    const client = this.get(host);
    if (client === undefined || client.getState() === 'alive') {
      return;
    }
    this.collection.delete(host);
    this.clientRemovedEmitter.fire(client);
  }

  public all(): Client[] {
    return Array.from(this.collection.values());
  }

  public get(host: string): Client | undefined {
    return this.collection.get(host);
  }

  public getElement(host: string): ClientElement | undefined {
    const client = this.get(host);
    const protocol = client?.getProtocol();
    if (client === undefined || protocol === undefined) {
      return;
    }
    return new ClientElement(protocol.url.host, protocol.serverVersion, client.getState());
  }
}
