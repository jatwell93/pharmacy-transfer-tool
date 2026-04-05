# Sample Data for Pharmacy Stock Transfer Tool

This directory contains sample data files to help you test and demonstrate the Pharmacy Stock Transfer Tool without needing to prepare your own data.

## Files

- `sample_sales_data.csv` - Master sales data for 4 stores (Balwyn, Carnegie, Sunshine, Trentham) with ~20 SKUs each. Use this to populate the database in Admin mode.
- `sample_deadstock_data.csv` - Dead stock data for Balwyn store. Use this in User mode to find transfer suggestions.
- `sample_sales_data.xlsx` - Excel version of the sales data CSV.

## How to Use

1. Start the backend server (Django).
2. In the frontend, switch to Admin mode.
3. Upload `sample_sales_data.csv` or `sample_sales_data.xlsx` to populate the sales database.
4. Switch to User mode, select "Balwyn" as the store.
5. Upload `sample_deadstock_data.csv` to see transfer suggestions.

## Data Details

- **Sales Data**: Contains ROU (Rate of Usage) values for various SKUs across stores. Some items are marked as "ranged" (checked).
- **Dead Stock Data**: Lists items with stock on hand (SOH) and cost, simulating dead stock from Balwyn that could be transferred to other stores with better sales performance.

Use these files to test features like header flexibility, Excel support, and matching logic.