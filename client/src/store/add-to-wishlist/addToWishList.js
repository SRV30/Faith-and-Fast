import axiosInstance from '@/api';
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

export const addToWishList = createAsyncThunk(
  'wishList/addToWishList',
  async (productId, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axiosInstance.post(
        '/api/wishlist/create',
        { productId },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          withCredentials: true,
        }
      );
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to add item to WishList'
      );
    }
  }
);

export const getWishListItems = createAsyncThunk(
  'wishList/getWishListItems',
  async (_, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axiosInstance.get('/api/wishlist/get', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        withCredentials: true,
      });
      return response.data;
    } catch (error) {
      // An empty wishlist is returned by the API as a 404. Treat it as an
      // empty (non-error) result so the page shows only the EmptyState.
      if (error.response?.status === 404) {
        return { data: [], error: false, success: true };
      }
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch WishList items'
      );
    }
  }
);

export const deleteWishListItem = createAsyncThunk(
  'wishList/deleteWishListItem',
  async (_id, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axiosInstance.delete('/api/wishList/delete', {
        headers: {
          Authorization: `Bearer ${token}`,
        },

        data: { _id },
        withCredentials: true,
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to delete WishList item'
      );
    }
  }
);

const WishListSlice = createSlice({
  name: 'wishList',
  initialState: {
    WishListItems: [],
    loading: false,
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder

      .addCase(addToWishList.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(addToWishList.fulfilled, (state, action) => {
        state.loading = false;
        state.WishListItems.push(action.payload.data);
      })
      .addCase(addToWishList.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      .addCase(getWishListItems.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getWishListItems.fulfilled, (state, action) => {
        state.loading = false;
        state.WishListItems = action.payload.data;
      })
      .addCase(getWishListItems.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      .addCase(deleteWishListItem.pending, (state) => {
        state.loading = true;
      })
      .addCase(deleteWishListItem.fulfilled, (state, action) => {
        state.loading = false;
        state.WishListItems = state.WishListItems.filter(
          (item) => item._id !== action.meta.arg
        );
      })
      .addCase(deleteWishListItem.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export default WishListSlice.reducer;
