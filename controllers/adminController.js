var db = require("../db/config");
var logger = require("../utils/logger");

var async = require("async");
var moment = require("moment");
var momentTz = require('moment-timezone');
var _ = require("lodash");

exports.getBranchProductDetailsForTarget = function (req, res, next) {
    var date = req.query.date;
    async.waterfall([
        function getFromBranchProduct(callback) {
            var sql = "select a.id, b.branch_id, b.bp_id, 'target' as TempField from `product` a, `branch-product` b where a.id = b.product_id order by a.id;"
            executeQuery(sql, function (data) {
                callback(null, data);
            });
        },
        function getTarget(resultData, callback) {
            var sql = "select branch_product_id , quantity as targetVal from `product-target` where effective_start_date <= ? and effective_end_date >= ?"
            db.query(sql, [date, date], function (err, result) {
                if (err) {
                    logger.error(err);
                }

                const r = groupBy(result, (c) => c.branch_product_id);
                const op = resultData.map((rs, i) => {
                    return Object.assign({}, rs, {targetVal: r[rs.bp_id] && r[rs.bp_id][0] ? r[rs.bp_id][0].targetVal : 0});
                })
                callback(null, op);
            });
        },
        function groupByBranchId(targetData, callback) {
            const result = groupBy(targetData, (c) => c.id);

            callback(null, result);
        },
        function getBranchesAndFormTemplate(groupedBranches, callback) {
            // branches order 1001,1002- form template {}
            var sql = "SELECT * from `branch` ";
            db.query(sql, function (err, result) {
                if (err) {
                    logger.error(err);
                }
                logger.info("Number of branchces " + result.length);
                var template = {};
                result.map((rs, i) => {
                    template[rs.id.toString()] = {
                        "id": '',
                        "branch_id": rs.id,
                        "bp_id": '',
                        "isEnabled": false,
                        "targetVal": 0
                    };
                });

                callback(null, {groupedBranches, template})

            });
        },
        function (prevdata, callback) {
            var bdata = prevdata.groupedBranches;
            var template = prevdata.template;
            var sql = "SELECT * FROM product";
            executeQuery(sql, function (data) {
                let productData = data
                for (let i in productData) {
                    var temp = Object.assign({}, template);
                    let pId = productData[i].id.toString();
                    let productUsedInBranches = bdata[pId];
                    if (productUsedInBranches == undefined) {
                        productData[i]['targetData'] = Object.values(temp);

                    } else {
                        for (var j = 0; j < productUsedInBranches.length; j++) {
                            var id = productUsedInBranches[j].branch_id.toString();
                            if (temp[id]) {
                                temp[id] = productUsedInBranches[j];
                                temp[id].isEnabled = true;
                            }
                        }
                        productData[i]['targetData'] = Object.values(temp);
                    }

                }
                callback(null, productData);
            })
        }
    ], function (err, result) {
        res.json(result);
    });
}


function executeQuery(sqlQuery, cb) {
    try {

        db.query(sqlQuery, function (err, result) {
            if (err) {
                logger.error(err);
                cb(err);
            }
            logger.info("Finding results");
            cb(result);
        });
    } catch (err) {
        cb(err);
    }
}

function groupBy(xs, f) {
    return xs.reduce((r, v, i, a, k = f(v)) => ((r[k] || (r[k] = [])).push(v), r), {});
}


exports.createOrReplaceTargets = createOrReplaceTargets;

function createOrReplaceTargets(req, res, next) {
    var date = req.body.date;
    var targets = req.body.targets;
    console.log(date, targets.length);

    async.eachSeries(targets, function (target, callback) {
        var updatequery = "update `product-target` set quantity = ? , created_date = ? where effective_start_date = ? and branch_product_id = ? ";
        try {
            db.query(updatequery, [target.targetVal, new Date(), date, target.bp_id], function (err, result) {
                if (err) {
                    logger.error(err);
                }
                if (result.affectedRows == 0) {
                    var sql = "INSERT into `product-target` (branch_product_id, effective_start_date, effective_end_date, quantity, created_date) values (?)";
                    var values = [
                        target.bp_id,
                        momentTz(date).tz("Asia/Kolkata").startOf("month").format("YYYY-MM-DD HH:mm:ss"),
                        momentTz(date).tz("Asia/Kolkata").endOf("month").format("YYYY-MM-DD HH:mm:ss"),
                        target.targetVal,
                        new Date()
                    ];
                    db.query(sql, [values], function (err, insRes) {
                        if (err) {
                            logger.error(err);
                        }
                    });
                }
            });
        } catch (err) {
            logger.error(err);
        }
        callback(null, []);
    }, function (err, result) {
        if (err) {
            return res.json({status: false});
        }
        return res.json({status: true});

    })
}

exports.saveProductDetails = (req, res, next) => {

    var productName = req.body.productName;
    var productDescription = req.body.productDescription;
    var tasks_length = req.body.tasks.length;
    var tasks = req.body.tasks;
    var branchIds = req.body.branchIds;
    var createdBy = req.body.createdBy;
    var productId = '';

    var insert_product_query = "INSERT into `product_master` (product_name,product_description,number_of_task,created_by,created_time) VALUES(?)";
    var insert_task_query = "INSERT into `product_master_steps` (task_name,task_description,created_by,created_time, product_master_id) VALUES(?)";
    var insert_branch_product_query = "INSERT into `branch-product_master` (branch_id,product_id,created_by,created_date, active) VALUES(?)";


    try {
        var values = [
            productName,
            productDescription,
            tasks_length,
            createdBy,
            new Date()];

        // insert into product table
        db.query(insert_product_query, [values], function (err, result) {
                if (err) {
                    logger.error(err);
                }
                var product_id = result.insertId;

                for (let task of tasks) {
                    var task_values = [
                        task.name,
                        task.description,
                        createdBy,
                        new Date(),
                        product_id
                    ];
                    // insert into tasks table
                    db.query(insert_task_query, [task_values], function (err, insRes) {
                        if (err) {
                            logger.error(err);
                        }
                    });

                }

                for (let branch_id of branchIds) {

                    product_branch_values = [
                        branch_id,
                        product_id,
                        createdBy,
                        new Date(),
                        'Y'
                    ];
                    // insert into branch product mapping
                    db.query(insert_branch_product_query, [product_branch_values], function (err, insRes) {
                        if (err) {
                            logger.error(err);
                        }
                    });

                }
            }
        );


    } catch (err) {
        logger.error(err);
        return res.json({status: false});
    }
    return res.json({status: true});

}

exports.getProducts = (req, res, next) => {

    // console.log(req.query.branchId);
    // var branch_id = req.query.branchId;


    var get_products_query = "SELECT  a.id, a.product_name FROM `product_master` a ";
    console.log(get_products_query)
    var product_array = []

    try {
        db.query(get_products_query, function (err, result, fields) {
            if (err) throw err;
            for (let res of result) {
                product_array.push({
                    id: res.id,
                    name: res.product_name
                });

            }
            console.log(product_array)
            return res.json(product_array);

        });
    } catch (err) {
        logger.error(err);
        return res.json({status: false});
    }
};

exports.getBranchForProduct = (req, res, next) => {

    console.log(req.query.branchId);
    var product_id = req.query.productId;


    var get_branch_for_product_query = "select a.branch_id, b.name from `product_master` a join `branch` b on a.branch_id = b.id where a.id = " + product_id;
    console.log(get_branch_for_product_query)
    var branch_array = []

    try {
        db.query(get_branch_for_product_query, function (err, result, fields) {
            if (err) throw err;
            for (let res of result) {
                branch_array.push({
                    id: res.id,
                    name: res.product_name
                });

            }
            console.log(branch_array)
            return res.json(branch_array);

        });
    } catch (err) {
        logger.error(err);
        return res.json({status: false});
    }
    console.log(branch_array);


};