var express = require('express')

var studentRouter = express.Router()
var studentController = require('../controllers').studentController;

studentRouter.route('/')
.all(function(req,res,next) {    
    res.status(400).json({error : "Invalid Request"});    
})

studentRouter.route('/:id')
.all(function(req,res,next) {
    console.log(' inside student router with student id param: ', req.params.id)
    next();
})
.get(studentController.getStudentDetailsByID)

module.exports = studentRouter;