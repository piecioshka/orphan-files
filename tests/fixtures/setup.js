// index.js
import './a.js';
import './b.js';

// a.js
console.log('a');

// b.js
import './c.js';

// c.js
console.log('c');

// unused.js
console.log('unused');

// test.spec.js
console.log('test');
