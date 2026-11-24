'use strict';

const passport = require('passport');
const login = require('connect-ensure-login');

module.exports.index = (req, res) => res.send('OAuth 2.0 Server');

module.exports.loginForm = (req, res) => res.render('login');

// keepSessionInfo: passport >= 0.6 regenerates the session on login, keep
// `returnTo` (set by ensureLoggedIn on /dialog/authorize) to continue the OAuth flow
module.exports.login = passport.authenticate('local', {
    successReturnToOrRedirect: '/',
    failureRedirect: '/login',
    keepSessionInfo: true,
});

module.exports.logout = (req, res, next) => {
    req.logout(error => {
        if (error) return next(error);
        return res.redirect('/');
    });
};

module.exports.account = [
    login.ensureLoggedIn(), (req, res) => res.render('account', {user: req.user}),
];
