import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

// Thunk to fetch receipts
export const fetchReceipts = createAsyncThunk('receipts/fetch', async (_, thunkAPI) => {
  // User can set custom endpoint/env
  const state: any = thunkAPI.getState();
  let apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
  // Optional: grab token from localStorage
  const token = typeof window !== 'undefined' ? localStorage.getItem('cognito_access_token') : undefined;
  // TODO: move this logic to a central infrastructure layer
  const res = await fetch(`${apiBase}/receipts`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return await res.json();
});

let pollInterval: NodeJS.Timeout | undefined;

export const startPollingReceipts = () => (dispatch: any) => {
  if (!pollInterval) {
    dispatch(fetchReceipts());
    pollInterval = setInterval(() => {
      dispatch(fetchReceipts());
    }, 10000);
  }
};

export const stopPollingReceipts = () => () => {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = undefined;
  }
};

const receiptsSlice = createSlice({
  name: 'receipts',
  initialState: {
    items: [],
    loading: false,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
    // We dont need to show loading, just flip straigh to the new data
    //   .addCase(fetchReceipts.pending, (state) => {
    //     state.loading = true;
    //   })
      .addCase(fetchReceipts.fulfilled, (state, action) => {
        state.items = action.payload;
        state.loading = false;
      })
      .addCase(fetchReceipts.rejected, (state) => {
        state.loading = false;
      });
  },
});

export default receiptsSlice.reducer;