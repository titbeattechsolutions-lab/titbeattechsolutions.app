import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  // A simple load test: ramp up to 50 virtual users over 10s, hold for 20s, ramp down over 10s.
  stages: [
    { duration: '10s', target: 50 },
    { duration: '20s', target: 50 },
    { duration: '10s', target: 0 },
  ],
};

export default function () {
  const res = http.get('http://localhost:4173/');
  
  check(res, {
    'status is 200': (r) => r.status === 200,
    'transaction time OK': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
