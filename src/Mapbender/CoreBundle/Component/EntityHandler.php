<?php

/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */

namespace Mapbender\CoreBundle\Component;

use Doctrine\Common\Util\ClassUtils;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Doctrine\ORM\Mapping\ClassMetadataFactory;

//use 

/**
 * Description of EntityHandler
 *
 * @author Paul Schmidt
 */
class EntityHandler
{

    protected $container;
    protected $entity;

    public function __construct(ContainerInterface $container, $entity)
    {
        $this->container = $container;
        $this->entity = $entity;
    }

    public function getEntity()
    {
        return $this->entity;
    }

    public function getContainer()
    {
        return $this->container;
    }

    public static function find(ContainerInterface $container, $entityClass, $entityId)
    {
        return $container->get('doctrine')->getRepository($entityClass)->find($entityId);
    }

    public static function createHandler(ContainerInterface $container, $entity)
    {
        $bundles = $container->get('kernel')->getBundles();
        $reflect = new \ReflectionClass($entity);
        $entityClass = ClassUtils::getClass($entity);
        $entityBundleFolder = substr($entityClass, 0, strpos($entityClass, '\\Entity\\'));
        $entityName = $reflect->getShortName();
        foreach ($bundles as $type => $bundle) {
            $bundleClass = get_class($bundle);
            if (strpos($bundleClass, $entityBundleFolder) === 0) {
                $handlerClass = $entityBundleFolder . '\\Component\\' . $entityName . 'EntityHandler';
                if (class_exists($handlerClass)) {
                    return new $handlerClass($container, $entity);
                } else {
                    return null;
                }
            }
        }
        return null;
    }

    public function getBundle(ContainerInterface $container, $entity)
    {
        $bundles = $container->get('kernel')->getBundles();
        $entityBundleFolder = substr(get_class($entity), 0, strpos(get_class($entity), '\\Entity\\'));
        foreach ($bundles as $type => $bundle) {
            $bundleClass = get_class($bundle);
            if (strpos($bundleClass, $entityBundleFolder) === 0) {
                return $bundle;
            }
        }
        return null;
    }

    /**
     * Returns an unique value for an unique field.
     * 
     * @param mixed $entity entity  object | entity class name
     * @param string $uniqueField name of the unique field
     * @param string $toUniqueValue value to the unique field
     * @param string $suffix suffix to generate an unique value
     * @return string an unique value
     */
    public function getUniqueValue($entity, $uniqueField, $toUniqueValue, $suffix = "")
    {
        if (is_object($entity)) {
            $entityName = get_class($entity);
        } else {
            $entityName = $entity;
        }
        $em = $this->container->get('doctrine')->getManager();
        $criteria = array();
        $criteria[$uniqueField] = $toUniqueValue;
        $obj = $em->getRepository($entityName)->findOneBy($criteria);
        if ($obj === null) {
            return $toUniqueValue;
        } else {
            $count = 0;
            do {
                $newUniqueValue = $toUniqueValue . $suffix . ($count > 0 ? $count : '');
                $count++;
                $criteria[$uniqueField] = $newUniqueValue;
            } while ($em->getRepository($entityName)->findOneBy($criteria));
            return $newUniqueValue;
        }
    }

    public static function isEntity(ContainerInterface $container, $entity)
    {
        $className = is_string($entity) ? $entity : is_object($entity) ? ClassUtils::getClass($entity) : '';
        try {
            $em = $container->get('doctrine')->getManager();
            $meta = $em->getMetadataFactory()->getMetadataFor($className);
            $is = isset($meta->isMappedSuperclass) && $meta->isMappedSuperclass === false;
            return $is;
        } catch (\Exception $e) {
            return false;
        }
    }

}
