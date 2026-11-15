// Entry point (task 16.1): placeholder mount of the app shell. Task 16.2 replaces the call below with `mountApp`.
import { mountShell } from './shell';

const root = document.getElementById('app');
if (root === null) throw new Error('index.html has no #app element');

mountShell(root, { languages: navigator.languages, doc: document });
