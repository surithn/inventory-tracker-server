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

    var sql = "SELECT distinct(prod.id) as productId, prod.product_name as productName from `maithree-db`.`student_task_mapping_details` stud_task join `maithree-db`.product_master prod ON stud_task.product_master_id = prod.id where stud_task.student_details_student_id = ?";
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
                if (each_obj.target === null && each_obj.completed === null) {        
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

/*
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
            })             
       })       
    } catch (err) {
        logger.error(err);
        next(err);
    }

}*/

exports.saveStudentTrackingDetails = (req,res,next) => {

    var taskdetails = req.body.task;

    var select_query_for_student_task_mapping = "SELECT mapping_id from `student_task_mapping_details` where student_details_student_id = ? AND product_master_id = ? AND product_master_steps_id = ? ";

    var tracking_ids = [];

    var today = moment().format('YYYY-MM-DD');

    logger.info("Today is :::: ", today);

    async.forEach(taskdetails, processEachTaskDetail, onProcessCompletedForAllTaskDetail);

    function processEachTaskDetail(each_task_detail, callbackFromTaskMapping) {
        var values = [req.body.studentId, req.body.productId, each_task_detail.id];
        
        db.query(select_query_for_student_task_mapping, values, (err, mappingResult) => {
            
            each_task_detail.mappingId = mappingResult[0].mapping_id;
            
            var delete_previous_tracking_for_student = "DELETE from `student_task_tracking` WHERE  student_task_mapping_details_mapping_id = ? AND date = ?";

            db.query(delete_previous_tracking_for_student, [each_task_detail.mappingId, today], (err, deleteResult) => {

                logger.info(" Previous tracking details deleted ::: ", JSON.stringify(deleteResult));

                // For each task, add entry to the tracking table
                var insert_query_for_student_task_tracking = "INSERT into `student_task_tracking` ( `target`,`completed`, `date`,`student_task_mapping_details_mapping_id`) values (?)"
                var tracking_values = [each_task_detail.target, each_task_detail.completed, today, each_task_detail.mappingId]

                db.query(insert_query_for_student_task_tracking, [tracking_values], (err, trackingResult) => {
                    tracking_ids.push(trackingResult.insertId);
                    logger.info(" Student tracking details saved for student ::: ", req.body.studentId, " , tracking id is ::: ", trackingResult.insertId);
                    callbackFromTaskMapping(null);
                })
            })
        })
    }

    function onProcessCompletedForAllTaskDetail() {
        logger.info(" Tracking details completed for student ::: ", req.body.studentId, " , tracking id are ::: ", tracking_ids);
        res.json({trackingIds : tracking_ids});
    }    
}


exports.getStudentProgress = (req,res,next) => {

    const date_format = 'YYYY-MM-DD';
    const original_date = moment();
    const given_date = original_date.clone();
    var studentId = req.query.studentId;
    
    var this_week_start_date = given_date.startOf('isoWeek').format(date_format)
    var this_week_end_date = given_date.endOf('isoWeek').format(date_format)
    var last_week_start_date = original_date.clone().isoWeekday(-6).format(date_format)
    var last_week_end_date = original_date.clone().isoWeekday(0).format(date_format)
    var second_last_week_start_date = original_date.clone().isoWeekday(-13).format(date_format)
    var second_last_week_end_date = original_date.clone().isoWeekday(-7).format(date_format)

    var progressResponse = {};

    var fetch_count_query = "select stud_task.student_details_student_id as studentId, SUM(target) as totalTarget, SUM(completed) as totalCompleted from `maithree-db`.student_task_mapping_details stud_task \
            JOIN (select * from `maithree-db`.student_task_tracking where date >= ? AND date <= ?) tracking ON stud_task.mapping_id = tracking.student_task_mapping_details_mapping_id \
            where stud_task.student_details_student_id = ? group by studentId"
            
    db.query(fetch_count_query,[this_week_start_date, this_week_end_date, studentId], (err, thisWeekProgressResults) => {
        //Make another query to find last week results
        db.query(fetch_count_query,[last_week_start_date, last_week_end_date, studentId], (err, lastWeekProgressResults) => {
            
            //Compare the results and send the response            
            console.log("This week result ::: ", thisWeekProgressResults);
            console.log("Last week result ::: ", lastWeekProgressResults);

            if (thisWeekProgressResults.length == 0 || lastWeekProgressResults.length == 0) {
                progressResponse.studentId = studentId;
                progressResponse.status = "No comparison"
                progressResponse.this_week = {
                    range : this_week_start_date + " to " + this_week_end_date,
                    target : (thisWeekProgressResults.length > 0 ? thisWeekProgressResults[0].totalTarget : 0),
                    completed : (thisWeekProgressResults.length > 0 ? thisWeekProgressResults[0].totalCompleted : 0)
                }
                progressResponse.last_week = {
                    range : last_week_start_date + " to " + last_week_end_date,
                    target : (lastWeekProgressResults.length > 0 ? lastWeekProgressResults[0].totalTarget : 0),
                    completed : (lastWeekProgressResults.length > 0 ? lastWeekProgressResults[0].totalCompleted : 0)
                }
            }
            else if (thisWeekProgressResults.length > 0 || lastWeekProgressResults > 0) {
                progressResponse.studentId = studentId;
                progressResponse.this_week = {
                    range : this_week_start_date + " to " + this_week_end_date,
                    target : thisWeekProgressResults[0].totalTarget,
                    completed : thisWeekProgressResults[0].totalCompleted
                }
                progressResponse.last_week = {
                    range : last_week_start_date + " to " + last_week_end_date,
                    target : lastWeekProgressResults[0].totalTarget,
                    completed : lastWeekProgressResults[0].totalCompleted
                }
                progressResponse.status = progressResponse.this_week.completed > progressResponse.last_week.completed ? 
                    "Improved" : progressResponse.this_week.completed < progressResponse.last_week.completed ? "Declined" : "Equal";
            }
            res.json(progressResponse);
        })
    })        

}

exports.getStudentProgressAcrossWeeks = (req,res,next) => {

    const sql_date_format = 'YYYY-MM-DD';
    const display_date_format = 'MMM Do';
    const original_date = moment();    
    var studentId = req.query.studentId;
    
    var this_week_start_date = original_date.clone().startOf('isoWeek')
    var this_week_end_date = original_date.clone().endOf('isoWeek')
    var last_week_start_date = original_date.clone().isoWeekday(-6)
    var last_week_end_date = original_date.clone().isoWeekday(0)
    var second_last_week_start_date = original_date.clone().isoWeekday(-13)
    var second_last_week_end_date = original_date.clone().isoWeekday(-7)

    var studentProgressTable = [];
    var cumulativeWeekTotal = {};

    var fetch_count_query = "select prod.id as productId, prod.product_name as productName, steps.id as taskId, task_name as taskName, SUM(target) as groupedTarget, SUM(completed) as groupedCompleted from `maithree-db`.product_master_steps steps JOIN `maithree-db`.product_master prod ON steps.product_master_id = prod.id \
        JOIN `maithree-db`.student_task_mapping_details stud_task ON stud_task.product_master_id = prod.id AND stud_task.product_master_steps_id = steps.id \
        JOIN (select * from `maithree-db`.student_task_tracking where date >= ? AND date <= ?) tracking ON stud_task.mapping_id = tracking.student_task_mapping_details_mapping_id \
        where stud_task.student_details_student_id = ? \
        group by productId, taskId order by productId ASC, taskId ASC"
            
    db.query(fetch_count_query,[this_week_start_date.format(sql_date_format), this_week_end_date.format(sql_date_format), studentId], (err, thisWeekProgressResults) => {
        //Make another query to find last week results
        db.query(fetch_count_query,[last_week_start_date.format(sql_date_format), last_week_end_date.format(sql_date_format), studentId], (err, lastWeekProgressResults) => {
            //Make another query to find second last week results
            db.query(fetch_count_query,[second_last_week_start_date.format(sql_date_format), second_last_week_end_date.format(sql_date_format), studentId], (err, secondLastWeekProgressResults) => {
                
                if (thisWeekProgressResults.length == 0 && lastWeekProgressResults.length == 0 && secondLastWeekProgressResults.length == 0) {
                    var infoMsg = `No Task Tracking record found for this studentId = ${studentId} in 3 weeks`;
                    logger.info(infoMsg);
                    res.status(404).json({error : infoMsg});
                }
                else {

                    async.waterfall([
                        async.apply(processEachWeekResults, secondLastWeekProgressResults, 1),
                        async.apply(processEachWeekResults, lastWeekProgressResults, 2),
                        async.apply(processEachWeekResults, thisWeekProgressResults, 3)
                    ], (err, result) => {
                        if (err) {
                            logger.error("Error occurred during processing", err);
                            res.status(500).json({error : "Error occurred during processing"})
                        }
                        logger.info("Processed all 3 week results. Returning to the caller with response. Result ::: ");
                        res.json(
                            { 
                                weeklyTotal : cumulativeWeekTotal,
                                progressTable : studentProgressTable
                            }
                        );
                    })

                    function processEachWeekResults (eachWeekProgressResults, processIndex, callbackAfterEachWeekProcessing) {
                        
                        if (eachWeekProgressResults.length > 0) {

                            var eachWeekTotal = 0;

                            _.each(eachWeekProgressResults, (eachSLWResult, slwIndex) => {

                                eachWeekTotal += eachSLWResult.groupedCompleted;

                                var productLevelProgress = { tasks: [] };

                                var existingProductIndex = _.findIndex(studentProgressTable, (entry) => {
                                    return entry.productId === eachSLWResult.productId;
                                });

                                // If the final table doesn't contain this product, then proceed to add product / tasks
                                if (existingProductIndex < 0) {
                                    productLevelProgress.productId = eachSLWResult.productId
                                    productLevelProgress.productName = eachSLWResult.productName
                                    productLevelProgress.tasks.push(processNewTaskProgress());
                                    studentProgressTable.push(productLevelProgress);
                                }

                                else {
                                    // Get the existing Product entry using the index
                                    productLevelProgress = studentProgressTable[existingProductIndex];

                                    var existingTaskIndex = _.findIndex(productLevelProgress.tasks, (entry) => {
                                        return entry.taskId === eachSLWResult.taskId;
                                    });

                                    if (existingTaskIndex < 0) {
                                        productLevelProgress.tasks.push(processNewTaskProgress());
                                    }
                                }

                                function processNewTaskProgress () {

                                    var taskProgress = {
                                        taskId: eachSLWResult.taskId,
                                        taskName: eachSLWResult.taskName
                                    }
                                    
                                    if (processIndex == 1) {
                                        taskProgress.week1 = {
                                            period: `${second_last_week_start_date.format(display_date_format)} - ${second_last_week_end_date.format(display_date_format)}`,
                                            target: eachSLWResult.groupedTarget,
                                            completed: eachSLWResult.groupedCompleted
                                        }

                                        //Filter the tasks from other week results and compare.
                                        var similarProgressFromPastWeek = _.filter(lastWeekProgressResults, (entry) => {
                                            return entry.productId === eachSLWResult.productId && entry.taskId === eachSLWResult.taskId
                                        })
                                        var similarProgressFromThisWeek = _.filter(thisWeekProgressResults, (entry) => {
                                            return entry.productId === eachSLWResult.productId && entry.taskId === eachSLWResult.taskId
                                        })

                                        taskProgress.week2 = {
                                            period: `${last_week_start_date.format(display_date_format)} - ${last_week_end_date.format(display_date_format)}`
                                        }

                                        if (similarProgressFromPastWeek.length > 0) {
                                            taskProgress.week2.target = similarProgressFromPastWeek[0].groupedTarget
                                            taskProgress.week2.completed = similarProgressFromPastWeek[0].groupedCompleted
                                            taskProgress.week2.status = taskProgress.week2.completed > taskProgress.week1.completed ?
                                                "Improved" : taskProgress.week2.completed < taskProgress.week1.completed ? "Declined" : "Equal"
                                        }
                                        
                                        taskProgress.week3 = {
                                            period: `${this_week_start_date.format(display_date_format)} - ${this_week_end_date.format(display_date_format)}`
                                        }

                                        if (similarProgressFromThisWeek.length > 0) {
                                            taskProgress.week3.target = similarProgressFromThisWeek[0].groupedTarget
                                            taskProgress.week3.completed = similarProgressFromThisWeek[0].groupedCompleted

                                            if (similarProgressFromPastWeek.length > 0) {                                            
                                                taskProgress.week3.status = taskProgress.week3.completed > taskProgress.week2.completed ?
                                                    "Improved"  : taskProgress.week3.completed < taskProgress.week2.completed ? "Declined" : "Equal"
                                            }
                                        }                             
                                    }

                                    // Process records from last week
                                    else if (processIndex == 2) {
                                        
                                        //Filter the tasks from other week results and compare.
                                        var similarProgressFromPastWeek = _.filter(secondLastWeekProgressResults, (entry) => {
                                            return entry.productId === eachSLWResult.productId && entry.taskId === eachSLWResult.taskId
                                        })
                                        var similarProgressFromNextWeek = _.filter(thisWeekProgressResults, (entry) => {
                                            return entry.productId === eachSLWResult.productId && entry.taskId === eachSLWResult.taskId
                                        })

                                        taskProgress.week1 = {
                                            period: `${second_last_week_start_date.format(display_date_format)} - ${second_last_week_end_date.format(display_date_format)}`,
                                        }

                                        taskProgress.week2 = {
                                            period: `${last_week_start_date.format(display_date_format)} - ${last_week_end_date.format(display_date_format)}`,
                                            target: eachSLWResult.groupedTarget,
                                            completed: eachSLWResult.groupedCompleted
                                        }

                                        if (similarProgressFromPastWeek.length > 0) {
                                            taskProgress.week1.target = similarProgressFromPastWeek[0].groupedTarget
                                            taskProgress.week1.completed = similarProgressFromPastWeek[0].groupedCompleted
                                            taskProgress.week2.status = taskProgress.week2.completed > taskProgress.week1.completed ?
                                                "Improved" : taskProgress.week2.completed < taskProgress.week1.completed ? "Declined" : "Equal"
                                        }

                                        taskProgress.week3 = {
                                            period: `${this_week_start_date.format(display_date_format)} - ${this_week_end_date.format(display_date_format)}`
                                        }

                                        if (similarProgressFromNextWeek.length > 0) {
                                            taskProgress.week3.target = similarProgressFromNextWeek[0].groupedTarget
                                            taskProgress.week3.completed = similarProgressFromNextWeek[0].groupedCompleted
                                            taskProgress.week3.status = taskProgress.week3.completed > taskProgress.week2.completed ?
                                                "Improved" : taskProgress.week3.completed < taskProgress.week2.completed ? "Declined" : "Equal"
                                        }
                                    }

                                    else {

                                        //Filter the tasks from other week results and compare.
                                        var similarProgressFromSecondPastWeek = _.filter(secondLastWeekProgressResults, (entry) => {
                                            return entry.productId === eachSLWResult.productId && entry.taskId === eachSLWResult.taskId
                                        })
                                        var similarProgressFromPastWeek = _.filter(lastWeekProgressResults, (entry) => {
                                            return entry.productId === eachSLWResult.productId && entry.taskId === eachSLWResult.taskId
                                        })

                                        taskProgress.week2 = {
                                            period: `${last_week_start_date.format(display_date_format)} - ${last_week_end_date.format(display_date_format)}`
                                        }

                                        taskProgress.week3 = {
                                            period: `${this_week_start_date.format(display_date_format)} - ${this_week_end_date.format(display_date_format)}`,
                                            target: eachSLWResult.groupedTarget,
                                            completed: eachSLWResult.groupedCompleted
                                        }

                                        if (similarProgressFromPastWeek.length > 0) {
                                            taskProgress.week2.target = similarProgressFromPastWeek[0].groupedTarget
                                            taskProgress.week2.completed = similarProgressFromPastWeek[0].groupedCompleted
                                            taskProgress.week3.status = taskProgress.week3.completed > taskProgress.week2.completed ?
                                                    "Improved" : taskProgress.week3.completed < taskProgress.week2.completed ? "Declined" : "Equal"
                                        }

                                        taskProgress.week1 = {
                                            period: `${second_last_week_start_date.format(display_date_format)} - ${second_last_week_end_date.format(display_date_format)}`,
                                        }

                                        if (similarProgressFromSecondPastWeek.length > 0) {
                                        
                                            taskProgress.week1.target = similarProgressFromSecondPastWeek[0].groupedTarget
                                            taskProgress.week1.completed = similarProgressFromSecondPastWeek[0].groupedCompleted

                                            if (similarProgressFromPastWeek.length > 0) {
                                                taskProgress.week2.status = taskProgress.week2.completed > taskProgress.week1.completed ?
                                                    "Improved" : taskProgress.week2.completed < taskProgress.week1.completed ? "Declined" : "Equal"
                                            }
                                        }
                                    }
                                    return taskProgress;
                                }                                
                            })
                            
                            if(processIndex === 1) {
                                cumulativeWeekTotal.week1 = eachWeekTotal;
                            }
                            else if (processIndex === 2) {
                                cumulativeWeekTotal.week2 = eachWeekTotal;
                            }
                            else {
                                cumulativeWeekTotal.week3 = eachWeekTotal;
                            }
                        }
                        else {
                            // Whatever weeks, we don't have tracking data, default it to 0.
                            if(processIndex === 1) {
                                cumulativeWeekTotal.week1 = 0;
                            }
                            else if (processIndex === 2) {
                                cumulativeWeekTotal.week2 = 0;
                            }
                            else {
                                cumulativeWeekTotal.week3 = 0;
                            }
                        }
                        callbackAfterEachWeekProcessing(null);
                    }
                }
            })
        })
    })
}