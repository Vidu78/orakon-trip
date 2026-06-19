import assert from 'node:assert/strict';
import test from 'node:test';
import type { FastifyInstance } from 'fastify';
import { InMemoryStore } from '../../agents/src/memoryStore';
import { buildServer } from '../src/server';

/**
 * Fast, dependency-free scenarios (in-memory store, keyword intent fallback).
 * Covers the core trip-continuity flow: start | pause | resume + charger.
 */
test('Orakon Trip MVP scenarios', async (t) => {
  const app: FastifyInstance = await buildServer();
  t.after(async () => {
    await app.close();
  });

  const json = (method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown) =>
    app.inject({
      method,
      url,
      payload: body === undefined ? undefined : JSON.stringify(body),
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    });

  let tripId = '';

  await t.test('scenario 1 — start: create a trip', async () => {
    const res = await json('POST', '/trips', {
      start: { lat: 45.4642, lng: 9.19, label: 'Milano' },
      end: { lat: 41.9028, lng: 12.4964, label: 'Roma' },
      route: [
        { lat: 45.4642, lng: 9.19 },
        { lat: 44.4949, lng: 11.3426 },
        { lat: 41.9028, lng: 12.4964 },
      ],
      batteryEst: 80,
    });
    assert.equal(res.statusCode, 201);
    const trip = res.json();
    assert.equal(trip.status, 'running');
    assert.ok(trip.id);
    tripId = trip.id;

    const audit = await json('GET', `/audit?tripId=${tripId}`);
    assert.equal(audit.statusCode, 200);
    assert.ok(audit.json().events.some((e: { type: string }) => e.type === 'trip.created'));
  });

  await t.test('scenario 2 — pause: update trip state to paused', async () => {
    const res = await json('PUT', `/trips/${tripId}`, { status: 'paused' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().status, 'paused');
  });

  await t.test('scenario 3 — resume + charger: resume then ask for a charger', async () => {
    const resume = await json('PUT', `/trips/${tripId}`, { status: 'running' });
    assert.equal(resume.statusCode, 200);
    assert.equal(resume.json().status, 'running');

    const intent = await json('POST', '/intent', {
      text: 'my battery is low, find a fast charger nearby',
      deviceId: 'watch-1',
      tripId,
    });
    assert.equal(intent.statusCode, 200);
    assert.equal(intent.json().action, 'charger');

    const audit = await json('GET', `/audit?tripId=${tripId}`);
    const types = audit.json().events.map((e: { type: string }) => e.type);
    assert.ok(types.includes('intent'), 'intent event was logged');
    assert.ok(
      types.filter((x: string) => x === 'trip.updated').length >= 2,
      'pause + resume both logged',
    );
  });
});

// OSRM gives real road distance/duration; routes.ts threads them onto the trip
// so the dashboard's at-rest ETA uses real speed, not a flat 100 km/h.
test('createTrip persists OSRM routeKm/routeMin', async () => {
  const store = new InMemoryStore();
  await store.init();
  const trip = await store.createTrip({
    start: { lat: 45.46, lng: 9.19 },
    end: { lat: 41.9, lng: 12.5 },
    routeKm: 575,
    routeMin: 345,
  });
  const back = await store.getTrip(trip.id);
  assert.equal(back?.routeKm, 575);
  assert.equal(back?.routeMin, 345);
  // avg speed the dashboard derives from these: ~100 km/h, sane for a mixed route.
  assert.ok(Math.round((575 / 345) * 60) === 100);
});
