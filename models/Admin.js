app.get('/admin', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send('Access denied');
    }

    res.send('Welcome Admin!');
});
