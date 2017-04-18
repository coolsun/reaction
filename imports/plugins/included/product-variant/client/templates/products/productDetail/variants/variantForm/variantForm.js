import { Meteor } from "meteor/meteor";
import { ReactiveDict } from "meteor/reactive-dict";
import { Session } from "meteor/session";
import { Template } from "meteor/templating";
import { Reaction, i18next } from "/client/api";
import { ReactionProduct } from "/lib/api";
import { applyProductRevision } from "/lib/api/products";
import { Products } from "/lib/collections";
import VariantFormContainer from "../../../../../containers/variantFormContainer";

Template.variantForm.onCreated(function () {
  this.state = new ReactiveDict();

  this.autorun(() => {
    const productHandle = Reaction.Router.getParam("handle");

    if (!productHandle) {
      Reaction.clearActionView();
    }
  });

  this.getVariant = (variant) => {
    const product = Products.findOne(variant._id);
    return applyProductRevision(product);
  };
});

/**
 * variantForm helpers
 */

Template.variantForm.helpers({
  variantFormComponent() {
    return VariantFormContainer;
  },
  variant() {
    const instance = Template.instance();
    return instance.getVariant(instance.data);
  },
  variantDetails: function () {
    if (this.ancestors.length === 1) {
      return Template.parentVariantForm;
    }
    return Template.childVariantForm;
  },
  childVariants: function () {
    const _id = this._id;
    const variants = ReactionProduct.getVariants();
    const childVariants = [];
    variants.map(variant => {
      if (~variant.ancestors.indexOf(_id) && variant.type !== "inventory") {
        childVariants.push(variant);
      }
    });
    return childVariants;
  },
  updateQuantityIfChildVariants: function () {
    if (ReactionProduct.checkChildVariants(this._id) > 0) {
      const _id = this._id;
      const variants = ReactionProduct.getVariants();
      let variantQuantity = 0;
      variants.map(variant => {
        if (~variant.ancestors.indexOf(_id) && variant.type !== "inventory") {
          variantQuantity += variant.inventoryQuantity;
        }
      });
      Meteor.call("products/updateProductField", _id, "inventoryQuantity", variantQuantity);
      return true;
    }
    return false;
  },
  variantFormId: function () {
    return "variant-form-" + this._id;
  },
  variantFormVisible: function () {
    if (!Session.equals("variant-form-" + this._id, true)) {
      return "hidden";
    }
  },
  displayInventoryManagement: function () {
    if (this.inventoryManagement !== true) {
      return "display:none;";
    }
  },
  displayLowInventoryWarning: function () {
    if (this.inventoryManagement !== true) {
      return "display:none;";
    }
  },
  displayTaxCodes: function () {
    if (this.taxable !== true) {
      return "display:none;";
    }
  }
});

/**
 * variantForm events
 */

Template.variantForm.events({
  "change form :input": function (event, template) {
    const field = Template.instance().$(event.currentTarget).attr("name");
    //
    // this should really move into a method
    //
    if (field === "taxable" || field === "inventoryManagement" || field === "inventoryPolicy") {
      const value = Template.instance().$(event.currentTarget).prop("checked");
      if (ReactionProduct.checkChildVariants(template.data._id) > 0) {
        const childVariants = ReactionProduct.getVariants(template.data._id);
        for (const child of childVariants) {
          Meteor.call("products/updateProductField", child._id, field, value,
            error => {
              if (error) {
                throw new Meteor.Error("error updating variant", error);
              }
            });
        }
      }
    } else if (field === "taxCode" || field === "taxDescription") {
      const value = Template.instance().$(event.currentTarget).prop("value");
      Meteor.call("products/updateProductField", template.data._id, field, value,
        error => {
          if (error) {
            throw new Meteor.Error("error updating variant", error);
          }
        });
      if (ReactionProduct.checkChildVariants(template.data._id) > 0) {
        const childVariants = ReactionProduct.getVariants(template.data._id);
        for (const child of childVariants) {
          Meteor.call("products/updateProductField", child._id, field, value,
              error => {
                if (error) {
                  throw new Meteor.Error("error updating variant", error);
                }
              });
        }
      }
    }
    // template.$(formId).submit();
    // ReactionProduct.setCurrentVariant(template.data._id);
  },
  "click .btn-child-variant-form": function (event, template) {
    event.stopPropagation();
    event.preventDefault();
    const productId = ReactionProduct.selectedProductId();

    if (!productId) {
      return;
    }

    Meteor.call("products/createVariant", template.data._id, function (error, result) {
      if (error) {
        Alerts.alert({
          text: i18next.t("productDetailEdit.addVariantFail", { title: template.data.title }),
          confirmButtonText: i18next.t("app.close", { defaultValue: "Close" })
        });
      } else if (result) {
        const newVariantId = result;
        const selectedProduct = ReactionProduct.selectedProduct();
        const handle = selectedProduct.__published && selectedProduct.__published.handle || selectedProduct.handle;
        ReactionProduct.setCurrentVariant(newVariantId);
        Session.set("variant-form-" + newVariantId, true);

        Reaction.Router.go("product", {
          handle: handle,
          variantId: newVariantId
        });
      }
    });
  }
});
