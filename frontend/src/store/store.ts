import { configureStore } from '@reduxjs/toolkit';
import receiptsReducer from './receiptSlice';

export const store = configureStore({
  reducer: {
    receipts: receiptsReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;