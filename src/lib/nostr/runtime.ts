import { EventStore } from 'applesauce-core';
import { RelayPool } from 'applesauce-relay';

export const relayPool = new RelayPool();
export const eventStore = new EventStore();
