// Checks if the user is authenticated or not
isAuthenticated = (req, res, next) => {
  if (req.session.user) return next();
      return res.redirect('/login');
}

// CHecks if the user is an administrator or not
isAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'admin') return next();
  return res.status(403).send('Access denied');
}

export { isAuthenticated, isAdmin }
