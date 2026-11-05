import React from 'react';
import {createRoot} from 'react-dom/client';
import DiningLoop from './dining-loop/DiningLoop';
import './base.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><DiningLoop/></React.StrictMode>);
