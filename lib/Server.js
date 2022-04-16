/* eslint-disable  */
import tldjs from 'tldjs';
import Debug from 'debug';
import express from 'express';
import { hri } from 'human-readable-ids';

import ClientManager from './ClientManager.js';

const debug = Debug('lt:server');

export default function (opt) {
  opt = opt || {};

  const validHosts = (opt.domain) ? [opt.domain] : undefined;
  const myTldjs = tldjs.fromUserSettings({ validHosts });
  const landingPage = opt.landing || 'https://localtunnel.github.io/www/';

  function GetClientIdFromHostname(hostname) {
    return myTldjs.getSubdomain(hostname);
  }

  const manager = new ClientManager(opt);

  const schema = opt.secure ? 'https' : 'http';

  const router = express.Router();

  router.get('/api/status', async (req, res, next) => {
    const { stats } = manager;
    res.send({
      tunnels: stats.tunnels,
      mem: process.memoryUsage(),
    });
  });

  router.get('/api/tunnels/:id/status', async (req, res, next) => {
    const clientId = req.params.id;
    const client = manager.getClient(clientId);
    if (!client) {
      res.status(404);
      res.send('Not found')
      return;
    }

    const stats = client.stats();
    res.send({
      connected_sockets: stats.connectedSockets,
    });
  });

  const app = express();

  app.use('/', router);

  // root endpoint
  app.use(async (req, res, next) => {
    const { path } = req;

    // skip anything not on the root path
    if (path !== '/') {
      await next();
      return;
    }

    const { new: requestedID } = req.query;
    const isNewClientRequest = requestedID !== undefined;
    if (isNewClientRequest) {
      if (requestedID && !/^(?:[a-z0-9][a-z0-9-]{2,63}[a-z0-9]|[a-z0-9]{2,63})$/.test(requestedID)) {
        const msg = 'Invalid subdomain. Subdomains must be lowercase and between 4 and 63 alphanumeric characters.';
        req.status = 403;
        req.body = {
          message: msg,
        };
        return;
      }
      const reqId = requestedID || hri.random();
      debug('making new client with id %s', reqId);
      const info = await manager.newClient(reqId);

      const url = `${schema}://${info.id}.${req.host}`;
      info.url = url;
      res.send(info);
      return;
    }

    // no new client request, send to landing page
    req.redirect(landingPage);
  });

  const server = app.listen(opt.port, opt.address, () => opt.then(server));

  server.on('request', (req, res) => {
    // without a hostname, we won't know who the request is for
    const hostname = req.headers.host;
    if (!hostname) {
      res.statusCode = 400;
      res.end('Host header is required');
      return;
    }

    const clientId = GetClientIdFromHostname(hostname);
    if (!clientId) {
      // appCallback(req, res);
      return;
    }

    console.log(manager);
    const client = manager.getClient(clientId);
    console.log(clientId, client);
    if (!client) {
      res.statusCode = 404;
      res.end('404');
      return;
    }

    client.handleRequest(req, res);
  });

  server.on('upgrade', (req, socket, head) => {
    const hostname = req.headers.host;
    if (!hostname) {
      socket.destroy();
      return;
    }

    const clientId = GetClientIdFromHostname(hostname);
    if (!clientId) {
      socket.destroy();
      return;
    }

    const client = manager.getClient(clientId);
    if (!client) {
      socket.destroy();
      return;
    }

    client.handleUpgrade(req, socket);
  });
}
