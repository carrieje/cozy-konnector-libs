const every = require('lodash/every')
const includes = require('lodash/includes')
const some = require('lodash/some')
const sumBy = require('lodash/sumBy')
const isWithinRange = require('date-fns/is_within_range')

const { getIdentifiers, getDateRangeFromBill, getAmountRangeFromBill } = require('./helpers')

// constants

const HEALTH_VENDORS = ['Ameli', 'Harmonie', 'Malakoff Mederic', 'MGEN'] // TODO: to import from each konnector
const HEALTH_CAT_ID_OPERATION = '400610' // TODO: import it from cozy-bank
const UNCATEGORIZED_CAT_ID_OPERATION = '0' // TODO: import it from cozy-bank

// helpers

const getCategoryId = o => {
  return o.manualCategoryId
    || o.automaticCategoryId
    || UNCATEGORIZED_CAT_ID_OPERATION
}

const checkOperationCategory = (operation, categoryId) => {
  return categoryId === getCategoryId(operation)
}
const isHealthOperation = operation => {
  return checkOperationCategory(operation, HEALTH_CAT_ID_OPERATION)
}
const isUncategorizedOperation = operation => {
  return checkOperationCategory(operation, UNCATEGORIZED_CAT_ID_OPERATION)
}

const isHealthBill = bill => {
  return includes(HEALTH_VENDORS, bill.vendor)
}

// filters

const filterByIdentifiers = identifiers => {
  identifiers = identifiers.map(i => i.toLowerCase())
  const identifierFilter = operation => {
    const label = operation.label.toLowerCase()
    return some(identifiers, identifier => includes(label, identifier))
  }
  return identifierFilter
}

const filterByDates = ({ minDate, maxDate }) => {
  const dateFilter = operation => {
    return isWithinRange(operation.date, minDate, maxDate)
  }
  return dateFilter
}

const filterByAmounts = ({ minAmount, maxAmount }) => {
  const amountFilter = operation => {
    return operation.amount >= minAmount && operation.amount <= maxAmount
  }
  return amountFilter
}

const filterByCategory = bill => {
  const isHealth = isHealthBill(bill)
  const categoryFilter = operation => {
    return isHealth
      ? isHealthOperation(operation) || isUncategorizedOperation(operation)
      : !isHealthOperation(operation) || isUncategorizedOperation(operation)
  }
  return categoryFilter
}

/**
 * Check that the sum of the reimbursements + the amount of the bill is not
 * greater that the amount of the operation
 */
const filterByReimbursements = (bill, options={}) => {
  const reimbursementFilter = operation => {
    const sumReimbursements = sumBy(operation.reimbursements, 'amount')
    return (sumReimbursements + bill.amount) <= -operation.amount
  }
  return reimbursementFilter
}

// combine filters

const operationsFilters = (bill, operations, options) => {
  const filterByConditions = filters => op => {
    for (let f of filters) {
      const res = f(op)
      if (!res) {
        return res
      }
    }
    return true
  }

  const fByDates = filterByDates(getDateRangeFromBill(bill, options))
  const fByAmounts = filterByAmounts(getAmountRangeFromBill(bill, options))
  const fByCategory = filterByCategory(bill)
  const fByReimbursements = filterByReimbursements(bill, options)

  const conditions = [fByDates, fByAmounts, fByCategory]
  if (!options.credit) {
    conditions.push(fByReimbursements)
  }

  // We filters with identifiers when
  // - we search a credit operation
  // - or when is bill is in the health category
  if (options.credit || !isHealthBill(bill)) {
    const fbyIdentifiers = filterByIdentifiers(getIdentifiers(options))
    conditions.push(fbyIdentifiers)
  }

  return operations.filter(filterByConditions(conditions))
}

module.exports = {
  filterByIdentifiers,
  filterByDates,
  filterByAmounts,
  filterByCategory,
  filterByReimbursements,
  operationsFilters
}
