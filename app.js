const express = require('express');
const app = express();
const jobRoutes = require('./api/jobRoutes');

app.use(express.json());
app.use('/api', jobRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
