require('dotenv').config();

var express = require('express');
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var methodOverride = require('method-override');

var flash = require('connect-flash');
var session = require('express-session');
var passport = require('passport');
require('./config/passport');
var app = express();
var port = process.env.PORT || 3000;

// DB settings
mongoose.set('useNewUrlParser', true);
mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);
mongoose.set('useUnifiedTopology', true);
mongoose.connect(process.env.MONGO_DB);
var db = mongoose.connection;
db.once('open', function(){
  console.log('DB connected');
});
db.on('error', function(err){
  console.log('DB ERROR : ', err);
});

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use('/public', express.static(__dirname+'/public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.engine('html', require('ejs').renderFile);
app.use(flash());
app.use(session({secret:'sssecret', resave:true, saveUninitialized:true}));
app.use(passport.initialize());
app.use(passport.session());

app.use(function(req, res, next){
  res.locals.isAuthenticated = req.isAuthenticated();
  res.locals.currentUser = req.user;
  next();
});

//Listen
var server = app.listen(port, function(){
  console.log("port:", port);
});

//routes
app.use('/', require('./router/main'));
app.use('/login', require('./router/login'));
app.use('/register', require('./router/register'));