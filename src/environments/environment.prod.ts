export const environment = {
  production: false,
  appVersion: '1.0.119',
  bypassAuth: false,
  supabase: {
    enabled: true,
    url: 'http://localhost:8000',
    anonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg3NjE3NzIwLCJleHAiOjE5NDUyOTc3MjB9.3KC628riEJB6_1UrR9jfuhQ65Pv-mIufLWbOP42Z2Gc',
    schema: 'myappdb',
  },
  // backendUrl:"http://190.166.82.95:3390/api"
  // backendUrl: 'https://8h4mmkd8-3390.use2.devtunnels.ms/api',

  //backendUrl: 'http://grupohierro.sytes.net:3390/api',
};
