import { getLargeScenery, getSmallScenery } from '../state/sceneryState.js'
import { getChatMessages } from '../state/chatState.js'
import { encode } from '@msgpack/msgpack'

export function sendClientId(client, clientId) {
   const response = {
      type: 'clientId',
      payload: clientId,
   }
   const encodedResponse = encode(response)
   client.send(encodedResponse)
}

export function sendLargeScenery(client) {
   const response = {
      type: 'largeScenery',
      payload: getLargeScenery(),
   }
   const encodedResponse = encode(response)
   client.send(encodedResponse)
}

export function sendSmallScenery(client) {
   const response = {
      type: 'smallScenery',
      payload: getSmallScenery(),
   }
   const encodedResponse = encode(response)
   client.send(encodedResponse)
}

export function sendChatMessages(client) {
   const response = {
      type: 'chatMessages',
      payload: getChatMessages(),
   }
   const encodedResponse = encode(response)
   client.send(encodedResponse)
}
