import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

export const fetchReceipts = createAsyncThunk('receipts/fetch', async () => {
  const res = await fetch('/api/receipts'); // adapt path
  return await res.json();
});

const receiptsSlice = createSlice({
  name: 'receipts',
  initialState: {
    items: [],
    loading: false,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchReceipts.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchReceipts.fulfilled, (state, action) => {
        state.items = action.payload;
        state.loading = false;
      });
  },
});

export default receiptsSlice.reducer;