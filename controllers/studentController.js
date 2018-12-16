var db = require("../db/config");
var logger = require("../utils/logger");

var moment = require("moment");
var momentTz = require('moment-timezone');
var async = require("async");
var _ = require("lodash");

exports.getStudentsByBranch = (req,res,next) => {
    var sql = "SELECT student_id as studentId, CONCAT(first_name, ' ' , last_name) as studentName from `student_details` where branch_id = ?";
    var branchId = req.params.id
    logger.info(`Get students for branch id ::: ${branchId}`);
    try {
       db.query(sql,[branchId], function(err, result) {
          if (err) {
            logger.error(err);
            return next(err);
          }
          logger.info(" Students retrived for branch ::: ", JSON.stringify(result));
          res.json(result);
        });
    } catch (err) {
        logger.error(err);
        next(err);
    }
}

exports.getProductsForStudent = (req,res,next) => {

    var sql = "SELECT prod.id as productId, prod.product_name as productName from `maithree-db`.`student_task_mapping_details` stud_task join `maithree-db`.product_master prod ON stud_task.product_master_id = prod.id where stud_task.student_details_student_id = ?";
    var studentId = req.body.studentId;
    logger.info(`Get Products for Student id ::: ${studentId}`);

    try {
        db.query(sql,[studentId], (err, result) => {
           if (err) {
             logger.error(err);
             return next(err);
           }
           logger.info(" Products data retrived for student ::: ", JSON.stringify(result));
           res.json(result);
         });
     } catch (err) {
         logger.error(err);
         next(err);
     }
}


exports.getTasksMappedForProduct = (req,res,next) => {

    var fetch_tasks_for_product_sql = "select prod.id as productId, steps.id as taskId, task_name as taskName, task_description as taskDescription, target, completed from `maithree-db`.product_master_steps steps JOIN `maithree-db`.product_master prod ON steps.product_master_id = prod.id JOIN `maithree-db`.student_task_mapping_details stud_task ON stud_task.product_master_id = prod.id AND stud_task.product_master_steps_id = steps.id LEFT OUTER JOIN (select * from `maithree-db`.student_task_tracking where date = current_date()) tracking ON stud_task.mapping_id = tracking.student_task_mapping_details_mapping_id where stud_task.product_master_id = ? AND stud_task.student_details_student_id = ?";

    logger.info(`Get Products for Product id ::: ${req.body.productId} , Student Id ::: ${req.body.studentId}`);

    try {
        db.query(fetch_tasks_for_product_sql,[req.body.productId,req.body.studentId], (err, result) => {
           if (err) {
             logger.error(err);
             return next(err);
           }
           var transformed_response = result.map((each_obj) => {
                if (!each_obj.target || !each_obj.completed) {        
                    each_obj.assigned = false;
                    each_obj.target = 0;
                    each_obj.completed = 0;
                    return each_obj;
                }
                else {
                    return {                        
                        productId : each_obj.productId,                                    
                        taskId : each_obj.taskId,
                        taskName : each_obj.taskName,
                        taskDescription : each_obj.taskDescription,
                        completed : each_obj.completed,
                        target : each_obj.target,
                        assigned : true
                    }
                }
           })
           logger.info(" Tasks retrived for product ::: ", JSON.stringify(transformed_response));
           res.json(transformed_response);
         });
     } catch (err) {
         logger.error(err);
         next(err);
     }
}

exports.getStudentProductMappingDetailsForBranchOld = (req,res,next) => {

    var select_student_query = "SELECT student_id, CONCAT(first_name, ' ', last_name) as name from `student_details` where branch_id = ?";
    var branchId = req.params.id;
    logger.info(`Get students for branch id ::: ${branchId}`);
    var student_ids = [];
    var students_task_mapping_ids = [];

    try {
       async.series([
            (callbackFromStudentTable) => {
            db.query(select_student_query,[branchId], (err, result) => {
                if (err) {
                    logger.error(err);
                    return next(err);
                }
                logger.info(" Students retrived for branch ::: ", JSON.stringify(result));
                student_ids = result.map(student => student.student_id);
                callbackFromStudentTable(null,result);
            })
        },
        (callbackFromStudentTaskMappingTable) => {
            var student_task_mapping_query = "SELECT * from `student_task_mapping_details` where student_details_student_id IN (?)"
            db.query(student_task_mapping_query,[student_ids], (err, result) => {
                if (err) {
                    logger.error(err);
                    return next(err);
                }
                logger.info("Tasks retrived for students ::: ", JSON.stringify(student_ids), " are ::: ", JSON.stringify(result));
                students_task_mapping_ids =  result.map(student_task_mapping => student_task_mapping.mapping_id);               
                callbackFromStudentTaskMappingTable(null, result);
            })    
        },
        (callbackFromStudentTrackingTable) => {
            var student_tracking_query = "SELECT * from `student_task_tracking` where date = ? AND student_task_mapping_details_mapping_id IN (?)";
            var today = moment().format("YYYY-MM-DD");
            db.query(student_tracking_query,[today, students_task_mapping_ids], (err, result) => {
                if (err) {
                    logger.error(err);
                    return next(err);
                }
                logger.info("Tasks tracking retrived for " , today ,  " for mapping ids ::: ", JSON.stringify(students_task_mapping_ids), " are ::: ", JSON.stringify(result));                               
                callbackFromStudentTrackingTable(null, result);
            })
        }
       ], (err, total_result) => {
            if (err) {
                logger.error(" Error occurred in one of the tasks ", err);
                return next(err);
            }
            //console.log(" All tasks completed ::: ", JSON.stringify(total_result));

            var consolidated_student_mapping = [], consolidated_response = {}
            _.each(total_result[0], (each_student) => {
                var student_details = each_student;
                var product_details = _.filter(total_result[1], (each_mapping) => {
                    return each_mapping.student_details_student_id ===  each_student.student_id
                });
                                
                var task_grouped_by_product = _.groupBy(product_details, "product_master_id");
                console.log("Product details for Student ", each_student.student_id, " is :::", task_grouped_by_product);
                
                var tasks_for_student, products_for_student = [];

                var product_details_fetched_from_db = {}

                var grouped_product_ids_for_student = Object.keys(task_grouped_by_product);

                _.each(grouped_product_ids_for_student, (each_product_id) => {
                    var fetch_product_details_query = "select id, product_name from `product_master` where id = ?";
                    db.query(fetch_product_details_query,[each_product_id], (err, result) => {
                        product_details_fetched_from_db = result;
                        _.each(task_grouped_by_product[each_product_id], (each_task_mapping) => {
                            var existing_tracking_details = _.filter(total_result[2], (each_tracking_details) => {
                                return each_tracking_details.student_task_mapping_details_mapping_id === each_task_mapping.mapping_id
                            })
                            var fetch_tasks_details_query = "select id, task_name, task_description from `product_master_steps` where id = ?";
                            db.query(fetch_tasks_details_query,[each_task_mapping.product_master_steps_id], (err, result) => {
                                var task_details = result;
                                if (existing_tracking_details.length > 0) {
                                    task_details.target = existing_tracking_details[0].target;
                                    task_details.completed = existing_tracking_details[0].completed;
                                    task_details.assigned = true;
                                }
                                else {
                                    task_details.target = 0;
                                    task_details.completed = 0;
                                    task_details.assigned = false
                                }
                                tasks_for_student.push(task_details);
                            })
                        })
                        //products_for_student.push(tasks_for_student);
                        product_details_fetched_from_db.tasks = tasks_for_student;
                        products_for_student.push(product_details_fetched_from_db);
                    })                    
                })
                student_details.products = products_for_student;
                consolidated_student_mapping.push(student_details);
            })
            consolidated_response.students = consolidated_student_mapping;
            logger.info(" Final consolidated student mapping response ::: ", JSON.stringify(consolidated_response));
            res.json(consolidated_response);
       })       
    } catch (err) {
        logger.error(err);
        next(err);
    }

}

exports.getStudentProductMappingDetailsForBranchOldv2 = (req,res,next) => {

    var select_student_query = "SELECT student_id, CONCAT(first_name, ' ', last_name) as name from `student_details` where branch_id = ?";
    var branchId = req.params.id;
    logger.info(`Get students for branch id ::: ${branchId}`);
    var student_ids = [];
    var students_task_mapping_ids = [];

    try {
       async.series([
            (callbackFromStudentTable) => {
            db.query(select_student_query,[branchId], (err, result) => {
                if (err) {
                    logger.error(err);
                    return next(err);
                }
                logger.info(" Students retrived for branch ::: ", JSON.stringify(result));
                student_ids = result.map(student => student.student_id);
                callbackFromStudentTable(null,result);
            })
        },
        (callbackFromStudentTaskMappingTable) => {
            var student_task_mapping_query = "SELECT * from `student_task_mapping_details` where student_details_student_id IN (?)"
            db.query(student_task_mapping_query,[student_ids], (err, result) => {
                if (err) {
                    logger.error(err);
                    return next(err);
                }
                logger.info("Tasks retrived for students ::: ", JSON.stringify(student_ids), " are ::: ", JSON.stringify(result));
                students_task_mapping_ids =  result.map(student_task_mapping => student_task_mapping.mapping_id);               
                callbackFromStudentTaskMappingTable(null, result);
            })    
        },
        (callbackFromStudentTrackingTable) => {
            var student_tracking_query = "SELECT * from `student_task_tracking` where date = ? AND student_task_mapping_details_mapping_id IN (?)";
            var today = moment().format("YYYY-MM-DD");
            db.query(student_tracking_query,[today, students_task_mapping_ids], (err, result) => {
                if (err) {
                    logger.error(err);
                    return next(err);
                }
                logger.info("Tasks tracking retrived for " , today ,  " for mapping ids ::: ", JSON.stringify(students_task_mapping_ids), " are ::: ", JSON.stringify(result));                               
                callbackFromStudentTrackingTable(null, result);
            })
        }
       ], (err, total_result) => {
            if (err) {
                logger.error(" Error occurred in one of the tasks ", err);
                return next(err);
            }
            //console.log(" All tasks completed ::: ", JSON.stringify(total_result));

            var consolidated_student_mapping = [], consolidated_response = {}

            var tasks_for_student = [] , products_for_student = [];

            var product_details_fetched_from_db = {};

            async.forEach(total_result[0], processEachStudent, onProcessCompletedForAllStudents);

            function processEachStudent(each_student, callbackFromEachStudent) {
                
                var student_details = each_student;
                
                var product_details = _.filter(total_result[1], (each_mapping) => {
                    return each_mapping.student_details_student_id ===  each_student.student_id
                });
                                
                var task_grouped_by_product = _.groupBy(product_details, "product_master_id");
                console.log("Product details for Student ", each_student.student_id, " is :::", task_grouped_by_product);
                
                var grouped_product_ids_for_student = Object.keys(task_grouped_by_product);
                
                async.forEach(grouped_product_ids_for_student, processEachProductIdForStudent, onProcessCompletedForProductId);

                function processEachProductIdForStudent (each_product_id, callbackFromEachProductId) {

                    var fetch_product_details_query = "SELECT id, product_name from `product_master` where id = ?";

                    db.query(fetch_product_details_query,[each_product_id], (err, result) => {
                        
                        product_details_fetched_from_db = result;
                        
                        async.forEach(task_grouped_by_product[each_product_id], processTasksForProducts, onProcessCompletedForTasks);

                        function processTasksForProducts(each_task_mapping, callbackFromTaskMapping) {
                            var existing_tracking_details = _.filter(total_result[2], (each_tracking_details) => {
                                return each_tracking_details.student_task_mapping_details_mapping_id === each_task_mapping.mapping_id
                            })
                            var fetch_tasks_details_query = "select id, task_name, task_description from `product_master_steps` where id = ?";
                            db.query(fetch_tasks_details_query,[each_task_mapping.product_master_steps_id], (err, result) => {
                                var task_details = result[0];
                                if (existing_tracking_details.length > 0) {
                                    task_details.target = existing_tracking_details[0].target;
                                    task_details.completed = existing_tracking_details[0].completed;
                                    task_details.assigned = true;
                                }
                                else {
                                    task_details.target = 0;
                                    task_details.completed = 0;
                                    task_details.assigned = false
                                }
                                tasks_for_student.push(task_details);
                                callbackFromTaskMapping(null);
                            })
                        }

                        function onProcessCompletedForTasks() {
                            product_details_fetched_from_db.tasks = tasks_for_student;
                            products_for_student.push(product_details_fetched_from_db);
                            callbackFromEachProductId(null);
                        }                        
                    })
                }

                function onProcessCompletedForProductId() {
                    student_details.products = products_for_student;
                    consolidated_student_mapping.push(student_details);
                    callbackFromEachStudent(null);
                }                
            }

            function onProcessCompletedForAllStudents() {
                consolidated_response.students = consolidated_student_mapping;
                logger.info(" Final consolidated student mapping response ::: ", JSON.stringify(consolidated_response));
                res.json(consolidated_response);
            }

            /* _.each(total_result[0], (each_student) => {
                var student_details = each_student;
                var product_details = _.filter(total_result[1], (each_mapping) => {
                    return each_mapping.student_details_student_id ===  each_student.student_id
                });
                                
                var task_grouped_by_product = _.groupBy(product_details, "product_master_id");
                console.log("Product details for Student ", each_student.student_id, " is :::", task_grouped_by_product);
                
                var tasks_for_student, products_for_student = [];

                var product_details_fetched_from_db = {}

                var grouped_product_ids_for_student = Object.keys(task_grouped_by_product);

                _.each(grouped_product_ids_for_student, (each_product_id) => {
                    var fetch_product_details_query = "select id, product_name from `product_master` where id = ?";
                    db.query(fetch_product_details_query,[each_product_id], (err, result) => {
                        product_details_fetched_from_db = result;
                        _.each(task_grouped_by_product[each_product_id], (each_task_mapping) => {
                            var existing_tracking_details = _.filter(total_result[2], (each_tracking_details) => {
                                return each_tracking_details.student_task_mapping_details_mapping_id === each_task_mapping.mapping_id
                            })
                            var fetch_tasks_details_query = "select id, task_name, task_description from `product_master_steps` where id = ?";
                            db.query(fetch_tasks_details_query,[each_task_mapping.product_master_steps_id], (err, result) => {
                                var task_details = result;
                                if (existing_tracking_details.length > 0) {
                                    task_details.target = existing_tracking_details[0].target;
                                    task_details.completed = existing_tracking_details[0].completed;
                                    task_details.assigned = true;
                                }
                                else {
                                    task_details.target = 0;
                                    task_details.completed = 0;
                                    task_details.assigned = false
                                }
                                tasks_for_student.push(task_details);
                            })
                        })
                        //products_for_student.push(tasks_for_student);
                        product_details_fetched_from_db.tasks = tasks_for_student;
                        products_for_student.push(product_details_fetched_from_db);
                    })                    
                })
                student_details.products = products_for_student;
                consolidated_student_mapping.push(student_details);
            }) */            
       })       
    } catch (err) {
        logger.error(err);
        next(err);
    }

}

exports.getStudentProductMappingDetailsForBranch = (req,res,next) => {

    //var select_student_query = "select stud.student_id as student_id, CONCAT(first_name, ' ' , last_name) as student_name, prod.id as product_id, prod.product_name, steps.id as task_id, task_name, task_description, target, completed, date from `maithree-db`.student_details stud join `maithree-db`.student_task_mapping_details stud_task ON stud.student_id =  stud_task.student_details_student_id JOIN `maithree-db`.product_master prod on stud_task.product_master_id = prod.id  JOIN `maithree-db`.product_master_steps steps ON stud_task.product_master_steps_id = steps.id AND steps.product_master_id = prod.id LEFT OUTER JOIN (select * from `maithree-db`.student_task_tracking where date = current_date()) tracking ON stud_task.mapping_id = tracking.student_task_mapping_details_mapping_id where stud.branch_id = ? order by student_id, product_id, task_id";

    var select_student_query = "select stud.student_id as student_id, CONCAT(first_name, ' ' , last_name) as student_name, prod.id as product_id, prod.product_name, steps.id as task_id, task_name, task_description, target, completed, date from `maithree-db`.student_details stud join `maithree-db`.student_task_mapping_details stud_task ON stud.student_id =  stud_task.student_details_student_id JOIN `maithree-db`.product_master prod on stud_task.product_master_id = prod.id  JOIN `maithree-db`.product_master_steps steps ON stud_task.product_master_steps_id = steps.id AND steps.product_master_id = prod.id LEFT OUTER JOIN (select * from `maithree-db`.student_task_tracking where date = current_date()) tracking ON stud_task.mapping_id = tracking.student_task_mapping_details_mapping_id where stud.branch_id = ? order by student_id, product_id, task_id";

    var branchId = req.params.id;
    logger.info(`Get students for branch id ::: ${branchId}`);
    var student_ids = [];
    var students_task_mapping_ids = [];

    db.query(select_student_query,[branchId], (err, result) => {
        logger.info(" Result from join query ::: " , JSON.stringify(result));
        res.json(result);
    })
}

exports.saveStudentTrackingDetails = (req,res,next) => {

    var taskdetails = req.body.task;

    var insert_query_for_student_task_mapping = "INSERT into `student_task_mapping_details` (product_master_id, product_master_steps_id, student_details_student_id) values (?)";

    var tracking_ids = [];

    async.forEach(taskdetails, processEachTaskDetail, onProcessCompletedForAllTaskDetail);

    function processEachTaskDetail(each_task_detail, callbackFromTaskMapping) {
        var values = [req.body.productId, each_task_detail.id, req.body.studentId];
        
        db.query(insert_query_for_student_task_mapping, [values], (err, insResult) => {
            
            each_task_detail.mappingId = insResult.insertId;
            
            // For each task, add entry to the tracking table
            var insert_query_for_student_task_tracking = "INSERT into `student_task_tracking` ( `target`,`completed`, `date`,`student_task_mapping_details_mapping_id`) values (?)"
            var tracking_values = [each_task_detail.target, each_task_detail.completed, new Date(), each_task_detail.mappingId]

            db.query(insert_query_for_student_task_tracking, [tracking_values], (err, trackingResult) => {
                tracking_ids.push(trackingResult.insertId);
                logger.info(" Student tracking details saved for student ::: ", req.body.studentId, " , tracking id is ::: ", trackingResult.insertId);
                callbackFromTaskMapping(null);
            })
        })
    }

    function onProcessCompletedForAllTaskDetail() {
        logger.info(" Tracking details completed for student ::: ", req.body.studentId, " , tracking id are ::: ", tracking_ids);
        res.json({trackingIds : tracking_ids});
    }    
}